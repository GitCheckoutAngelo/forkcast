-- Pin search_path on handle_new_user to prevent search-path hijacking.
-- SECURITY DEFINER functions without a fixed search_path are flagged by the
-- Supabase security linter.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
