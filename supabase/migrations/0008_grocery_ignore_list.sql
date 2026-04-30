-- Add grocery_ignore_list to user_profiles.
-- Stores items the user considers pantry staples. During grocery list generation
-- the AI marks any ingredient that fuzzy-matches this list as is_pantry_staple: true,
-- which moves it to a collapsed section at the bottom of the list.
-- Defaults cover the most common "always on hand" basics.

alter table public.user_profiles
  add column grocery_ignore_list text[] not null
  default '{salt,pepper,water,"olive oil","vegetable oil","cooking oil"}'::text[];
