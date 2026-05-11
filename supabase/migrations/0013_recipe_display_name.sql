-- Add optional display_name to recipes.
-- When set, the meal planner shows this instead of the recipe name.
-- Multiple recipes can share the same display_name.

alter table public.recipes
  add column display_name text null;

-- Update upsert_recipe to handle display_name in both UPDATE and INSERT paths.
create or replace function public.upsert_recipe(
  p_recipe      jsonb,
  p_ingredients jsonb
) returns uuid language plpgsql security invoker as $$
declare
  v_id  uuid;
  v_ing jsonb;
  v_pos integer := 0;
begin
  if (p_recipe->>'id') is not null then
    v_id := (p_recipe->>'id')::uuid;

    update public.recipes set
      name               = p_recipe->>'name',
      display_name       = nullif(p_recipe->>'display_name', ''),
      description        = nullif(p_recipe->>'description', ''),
      source             = case when p_recipe->'source' = 'null'::jsonb then null
                                else p_recipe->'source' end,
      servings           = (p_recipe->>'servings')::numeric,
      prep_time_min      = nullif(p_recipe->>'prep_time_min', '')::integer,
      cook_time_min      = nullif(p_recipe->>'cook_time_min', '')::integer,
      instructions       = case when p_recipe->'instructions' = 'null'::jsonb then null
                                else p_recipe->'instructions' end,
      macros_per_serving = p_recipe->'macros_per_serving',
      macros_verified    = (p_recipe->>'macros_verified')::boolean,
      cuisine            = nullif(p_recipe->>'cuisine', ''),
      meal_types         = coalesce(
                             (select array_agg(x::meal_slot_type)
                              from jsonb_array_elements_text(p_recipe->'meal_types') x),
                             '{}'::meal_slot_type[]),
      tags               = coalesce(
                             (select array_agg(x)
                              from jsonb_array_elements_text(p_recipe->'tags') x),
                             '{}'),
      image_url          = nullif(p_recipe->>'image_url', '')
    where id = v_id;

    if not found then
      raise exception 'Recipe % not found or access denied', v_id;
    end if;

  else
    insert into public.recipes (
      user_id, name, display_name, description, source, servings,
      prep_time_min, cook_time_min, instructions,
      macros_per_serving, macros_verified, cuisine,
      meal_types, tags, image_url
    ) values (
      auth.uid(),
      p_recipe->>'name',
      nullif(p_recipe->>'display_name', ''),
      nullif(p_recipe->>'description', ''),
      case when p_recipe->'source' = 'null'::jsonb then null
           else p_recipe->'source' end,
      (p_recipe->>'servings')::numeric,
      nullif(p_recipe->>'prep_time_min', '')::integer,
      nullif(p_recipe->>'cook_time_min', '')::integer,
      case when p_recipe->'instructions' = 'null'::jsonb then null
           else p_recipe->'instructions' end,
      p_recipe->'macros_per_serving',
      (p_recipe->>'macros_verified')::boolean,
      nullif(p_recipe->>'cuisine', ''),
      coalesce(
        (select array_agg(x::meal_slot_type)
         from jsonb_array_elements_text(p_recipe->'meal_types') x),
        '{}'::meal_slot_type[]),
      coalesce(
        (select array_agg(x)
         from jsonb_array_elements_text(p_recipe->'tags') x),
        '{}'),
      nullif(p_recipe->>'image_url', '')
    )
    returning id into v_id;
  end if;

  delete from public.recipe_ingredients where recipe_id = v_id;

  for v_ing in select value from jsonb_array_elements(p_ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id, position, quantity, unit, name, preparation, raw_text
    ) values (
      v_id,
      v_pos,
      nullif(v_ing->>'quantity', '')::numeric,
      nullif(v_ing->>'unit', ''),
      v_ing->>'name',
      nullif(v_ing->>'preparation', ''),
      coalesce(v_ing->>'raw_text', v_ing->>'name')
    );
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;
