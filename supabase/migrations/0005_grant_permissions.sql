-- Grant schema + table access to anon and authenticated roles.
-- Supabase's default project setup adds these via alter default privileges,
-- but migrations running as postgres may not inherit them depending on
-- project age / setup. Explicit grants are idempotent and always correct.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.user_profiles     to authenticated;
grant select, insert, update, delete on public.food_items        to authenticated;
grant select, insert, update, delete on public.recipes           to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.meal_plans        to authenticated;
grant select, insert, update, delete on public.plan_days         to authenticated;
grant select, insert, update, delete on public.meal_slots        to authenticated;
grant select, insert, update, delete on public.meal_entries      to authenticated;

-- Allow authenticated users to call server-side functions (RPC).
grant execute on function public.upsert_recipe(jsonb, jsonb) to authenticated;

-- Ensure future tables in public also get grants automatically.
alter default privileges in schema public grant all on tables    to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant all on functions to authenticated;
