-- create_meal_plan: atomically creates a MealPlan + 7 PlanDays + 28 MealSlots.
--
-- The week-alignment trigger on meal_plans fires and validates p_start_date.
-- Returns the new meal_plan UUID on success.
-- Called from server actions via supabase.rpc('create_meal_plan', {...}).
--
-- Uses SECURITY INVOKER so the caller's RLS policies apply.

create or replace function public.create_meal_plan(
  p_start_date date,
  p_name       text default null
) returns uuid language plpgsql security invoker as $$
declare
  v_plan_id uuid;
  v_day_id  uuid;
begin
  insert into public.meal_plans (user_id, start_date, end_date, name)
  values (auth.uid(), p_start_date, p_start_date + 6, p_name)
  returning id into v_plan_id;

  for i in 0..6 loop
    insert into public.plan_days (meal_plan_id, date)
    values (v_plan_id, p_start_date + i)
    returning id into v_day_id;

    insert into public.meal_slots (plan_day_id, slot_type, position)
    values
      (v_day_id, 'breakfast', 0),
      (v_day_id, 'lunch',     0),
      (v_day_id, 'dinner',    0),
      (v_day_id, 'snack',     0);
  end loop;

  return v_plan_id;
end;
$$;
