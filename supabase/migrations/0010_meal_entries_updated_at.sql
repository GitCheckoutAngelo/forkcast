-- Add updated_at to meal_entries so grocery lists can detect when the meal
-- plan changed after a list was generated (stale detection).

ALTER TABLE public.meal_entries
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows to the Unix epoch so they don't falsely appear stale
-- against already-generated lists. New rows get DEFAULT now(); updates get the
-- trigger below.
UPDATE public.meal_entries SET updated_at = 'epoch'::timestamptz;

CREATE TRIGGER meal_entries_set_updated_at
  BEFORE UPDATE ON public.meal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
