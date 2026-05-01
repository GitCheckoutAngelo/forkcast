-- Add per-trip date columns to grocery_lists.
-- This allows splitting a plan's shopping into multiple trips (max 3).

alter table public.grocery_lists
  add column start_date date,
  add column end_date   date,
  add column name       text;

-- Backfill: existing single-list rows get the full plan date range.
update public.grocery_lists gl
set
  start_date = mp.start_date::date,
  end_date   = mp.end_date::date
from public.meal_plans mp
where gl.meal_plan_id = mp.id;

-- Lock in NOT NULL now that backfill is complete.
alter table public.grocery_lists
  alter column start_date set not null,
  alter column end_date   set not null;

-- Swap the unique constraint: a plan can now have multiple lists,
-- but each trip must have a distinct start_date within the plan.
alter table public.grocery_lists
  drop constraint grocery_lists_meal_plan_id_key;

alter table public.grocery_lists
  add constraint grocery_lists_meal_plan_id_start_date_key
  unique (meal_plan_id, start_date);

create index if not exists grocery_lists_meal_plan_id_start_date_idx
  on public.grocery_lists (meal_plan_id, start_date);
