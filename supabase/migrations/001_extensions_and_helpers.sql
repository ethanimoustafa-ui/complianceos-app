-- 001_extensions_and_helpers
-- Extensions and shared helper functions used by every subsequent migration.

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- Generic updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Short id generator (optional helper; not yet used for any FK)
create or replace function public.gen_short_id(prefix text)
returns text
language plpgsql
as $$
declare
  suffix text;
begin
  suffix := upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 8));
  return prefix || '-' || suffix;
end;
$$;
