-- 026_circular_reference_helper
-- The circulars SELECT RLS policy filters out soft-deleted rows
-- (`deleted_at IS NULL`). The previous client-side nextCircularReference
-- helper queried via the user's RLS context, so it could not see ghost
-- references on soft-deleted rows. The DB UNIQUE constraint sees them,
-- so newly-minted references collided after a soft-delete.
--
-- Fix: a SECURITY DEFINER function that bypasses RLS for the
-- read-only "what's the highest used reference" query.

create or replace function public.compute_next_circular_reference(
  p_authority text,
  p_year int default extract(year from now() at time zone 'utc')::int
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_max_tail int;
  v_next int;
begin
  if p_authority is null or length(trim(p_authority)) = 0 then
    raise exception 'p_authority required';
  end if;

  v_prefix := upper(p_authority) || '-CIR-' || p_year::text || '-';

  -- Pull the largest numeric tail from every matching reference, including
  -- soft-deleted rows. Non-numeric tails are ignored.
  select coalesce(max(tail_int), 0)
  into v_max_tail
  from (
    select case
             when substring(reference from (length(v_prefix) + 1)) ~ '^[0-9]+$'
             then substring(reference from (length(v_prefix) + 1))::int
             else null
           end as tail_int
    from public.circulars
    where reference ilike v_prefix || '%'
  ) s
  where tail_int is not null;

  v_next := v_max_tail + 1;
  return v_prefix || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.compute_next_circular_reference(text, int) from public;
grant execute on function public.compute_next_circular_reference(text, int) to authenticated, service_role;

notify pgrst, 'reload schema';
