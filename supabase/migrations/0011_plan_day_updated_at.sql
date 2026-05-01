-- Add updated_at to plan_days and keep it current via a trigger on meal_entries.
-- This catches all change types (insert, update, delete) for stale detection.

ALTER TABLE public.plan_days
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill to epoch so existing rows don't falsely mark generated lists as stale.
UPDATE public.plan_days SET updated_at = 'epoch'::timestamptz;

-- Bump plan_days.updated_at whenever a meal_entry in that day is added, changed,
-- or removed. Uses COALESCE so DELETE (OLD only) and INSERT (NEW only) both work.
CREATE OR REPLACE FUNCTION public.touch_plan_day_on_entry_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_plan_day_id uuid;
BEGIN
  SELECT plan_day_id INTO v_plan_day_id
  FROM public.meal_slots
  WHERE id = COALESCE(NEW.meal_slot_id, OLD.meal_slot_id);

  UPDATE public.plan_days
  SET updated_at = now()
  WHERE id = v_plan_day_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER meal_entries_touch_plan_day
  AFTER INSERT OR UPDATE OR DELETE ON public.meal_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_plan_day_on_entry_change();
