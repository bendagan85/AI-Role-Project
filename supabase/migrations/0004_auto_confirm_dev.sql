-- 0004_auto_confirm_dev.sql
--
-- DEMO/DEV ONLY. Auto-confirms a user's email on signup so the new account
-- can log in immediately without an SMTP round-trip. This is appropriate
-- here because:
--   (a) The two seeded demo accounts (StrengthLab, FuelRight) are created
--       via supabase.auth.admin.createUser({ email_confirm: true }) and
--       never see this trigger.
--   (b) Any reviewer or candidate signing up manually for testing should
--       not be blocked by an SMTP that isn't configured for this demo.
--
-- For production: drop this trigger and rely on real email confirmation.
--   drop trigger on_auth_user_auto_confirm on auth.users;
--   drop function public.auto_confirm_user();

create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at = now();
  end if;
  return new;
end;
$$;

create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_user();
