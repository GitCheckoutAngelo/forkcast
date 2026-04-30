-- grocery_lists: one snapshot list per meal plan, replaced on regeneration.
-- Items are stored as a JSONB array (GroceryItem[]) to avoid a wide relational
-- schema for what is essentially a user-editable snapshot that changes as a unit.

create table public.grocery_lists (
  id            uuid        primary key default gen_random_uuid(),
  meal_plan_id  uuid        not null references public.meal_plans(id) on delete cascade,
  generated_at  timestamptz not null default now(),
  items         jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (meal_plan_id)
);

alter table public.grocery_lists enable row level security;

create policy "Users can read own grocery lists"
  on public.grocery_lists for select
  using (
    meal_plan_id in (
      select id from public.meal_plans where user_id = auth.uid()
    )
  );

create policy "Users can insert own grocery lists"
  on public.grocery_lists for insert
  with check (
    meal_plan_id in (
      select id from public.meal_plans where user_id = auth.uid()
    )
  );

create policy "Users can update own grocery lists"
  on public.grocery_lists for update
  using (
    meal_plan_id in (
      select id from public.meal_plans where user_id = auth.uid()
    )
  );

create policy "Users can delete own grocery lists"
  on public.grocery_lists for delete
  using (
    meal_plan_id in (
      select id from public.meal_plans where user_id = auth.uid()
    )
  );

create trigger set_grocery_lists_updated_at
  before update on public.grocery_lists
  for each row execute function public.set_updated_at();
