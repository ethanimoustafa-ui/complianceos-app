-- 111_email_digest_pref
-- Server-readable opt-in for the daily digest email. The rest of the user
-- preference bag is still client-only (localStorage), but a cron job can't read
-- that, so the digest gate lives on profiles. Opt-OUT model: default true, so
-- users with relevant items receive the digest until they turn it off.

alter table public.profiles
  add column if not exists email_digest_enabled boolean not null default true;
