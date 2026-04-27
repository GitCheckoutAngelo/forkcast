-- ============================================================================
-- MEAL PLANNING APP — SUPABASE SCHEMA
-- ============================================================================
-- Notes:
-- * RLS policies are stubbed at the bottom — review and tighten before prod.
-- * Macros are stored as JSONB for ergonomics. If you need to filter/aggregate
--   on individual macros at the DB level often, promote them to columns later.
-- * `auth.users` is Supabase's built-in user table; profiles extend it.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ----- Enums ----------------------------------------------------------------

create type meal_slot_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type serving_unit as enum (
  'serving', 'g', 'ml', 'piece', 'cup', 'tbsp', 'tsp', 'oz'
);

-- ----- User profile ---------------------------------------------------------

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  macro_target jsonb,                              -- shape: MacroTarget
  timezone text not null default 'UTC',
  -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Default Monday.
  week_start_day smallint not null default 1
    check (week_start_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- Food items -----------------------------------------------------------

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null,
  brand text,
  serving_size numeric not null check (serving_size > 0),
  serving_unit serving_unit not null,
  macros_per_serving jsonb not null,               -- shape: Macros
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index food_items_user_id_idx on public.food_items(user_id);
create index food_items_name_idx on public.food_items(user_id, name);

-- ----- Recipes --------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null,
  description text,
  source jsonb,                                    -- shape: RecipeSource | null
  servings numeric not null check (servings > 0),
  prep_time_min integer check (prep_time_min >= 0),
  cook_time_min integer check (cook_time_min >= 0),
  instructions jsonb,                              -- string[] | null
  macros_per_serving jsonb not null,               -- shape: Macros
  macros_verified boolean not null default false,
  cuisine text,
  meal_types meal_slot_type[] not null default '{}',
  tags text[] not null default '{}',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes(user_id);
create index recipes_name_idx on public.recipes(user_id, name);
create index recipes_meal_types_idx on public.recipes using gin (meal_types);
create index recipes_tags_idx on public.recipes using gin (tags);

-- ----- Recipe ingredients ---------------------------------------------------

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null,
  quantity numeric,
  unit text,
  name text not null,
  preparation text,
  raw_text text not null,
  unique (recipe_id, position)
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);

-- ----- Meal plans -----------------------------------------------------------

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A plan is always exactly 7 days.
  constraint meal_plans_seven_days check (end_date = start_date + interval '6 days'),
  -- One plan per starting Monday (or whatever start date) per user.
  unique (user_id, start_date)
);

create index meal_plans_user_id_idx on public.meal_plans(user_id);

-- ----- Plan days ------------------------------------------------------------

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  date date not null,
  macro_target_override jsonb,                     -- MacroTarget | null
  notes text,
  unique (meal_plan_id, date)
);

create index plan_days_meal_plan_id_idx on public.plan_days(meal_plan_id);

-- ----- Meal slots -----------------------------------------------------------

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  slot_type meal_slot_type not null,
  position integer not null default 0,
  notes text,
  -- One breakfast/lunch/dinner per day, but multiple snacks allowed.
  unique (plan_day_id, slot_type, position)
);

create index meal_slots_plan_day_id_idx on public.meal_slots(plan_day_id);

-- ----- Meal entries (polymorphic: recipe XOR food_item) ---------------------

create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  meal_slot_id uuid not null references public.meal_slots(id) on delete cascade,
  position integer not null default 0,
  recipe_id uuid references public.recipes(id) on delete restrict,
  food_item_id uuid references public.food_items(id) on delete restrict,
  servings numeric not null default 1.0 check (servings > 0),
  macros_override jsonb,                           -- Macros | null
  notes text,
  -- Exactly one of recipe_id / food_item_id must be set.
  constraint meal_entries_one_consumable check (
    (recipe_id is not null and food_item_id is null)
    or (recipe_id is null and food_item_id is not null)
  ),
  unique (meal_slot_id, position)
);

create index meal_entries_meal_slot_id_idx on public.meal_entries(meal_slot_id);
create index meal_entries_recipe_id_idx on public.meal_entries(recipe_id);
create index meal_entries_food_item_id_idx on public.meal_entries(food_item_id);

-- ----- updated_at trigger ---------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();
create trigger food_items_set_updated_at before update on public.food_items
  for each row execute function public.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger meal_plans_set_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();

-- ----- Meal plan week alignment ---------------------------------------------
-- Enforces that meal_plans.start_date falls on the user's chosen week_start_day.
-- Done as a trigger because CHECK constraints can't reference another table.

create or replace function public.check_meal_plan_week_alignment()
returns trigger language plpgsql as $$
declare
  expected_dow smallint;
  actual_dow smallint;
begin
  select week_start_day into expected_dow
  from public.user_profiles
  where id = new.user_id;

  -- EXTRACT(DOW) returns 0=Sunday..6=Saturday, matching our convention.
  actual_dow := extract(dow from new.start_date)::smallint;

  if actual_dow <> expected_dow then
    raise exception
      'meal_plan.start_date (% — dow %) must fall on user''s week_start_day (%)',
      new.start_date, actual_dow, expected_dow;
  end if;
  return new;
end;
$$;

create trigger meal_plans_check_week_alignment
  before insert or update of start_date, user_id on public.meal_plans
  for each row execute function public.check_meal_plan_week_alignment();

-- ----- Row Level Security (stubs — review before prod) ----------------------

alter table public.user_profiles enable row level security;
alter table public.food_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.meal_slots enable row level security;
alter table public.meal_entries enable row level security;

-- Owners can do anything with their own rows.
create policy "own profile"      on public.user_profiles for all using (auth.uid() = id);
create policy "own food_items"   on public.food_items    for all using (auth.uid() = user_id);
create policy "own recipes"      on public.recipes       for all using (auth.uid() = user_id);
create policy "own meal_plans"   on public.meal_plans    for all using (auth.uid() = user_id);

-- Children inherit ownership via their parent.
create policy "own recipe_ingredients" on public.recipe_ingredients for all using (
  exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
);
create policy "own plan_days" on public.plan_days for all using (
  exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.user_id = auth.uid())
);
create policy "own meal_slots" on public.meal_slots for all using (
  exists (
    select 1 from public.plan_days d
    join public.meal_plans p on p.id = d.meal_plan_id
    where d.id = plan_day_id and p.user_id = auth.uid()
  )
);
create policy "own meal_entries" on public.meal_entries for all using (
  exists (
    select 1 from public.meal_slots s
    join public.plan_days d on d.id = s.plan_day_id
    join public.meal_plans p on p.id = d.meal_plan_id
    where s.id = meal_slot_id and p.user_id = auth.uid()
  )
);