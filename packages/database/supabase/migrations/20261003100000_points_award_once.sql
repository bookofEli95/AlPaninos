-- An order's PaninoPoints were awarded every time it became 'completed',
-- so staff moving it completed -> ready -> completed paid the points twice.
-- Now each order is paid once: points_awarded_at records that it's done.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_awarded_at TIMESTAMPTZ;

-- Orders already completed have been paid.
UPDATE public.orders
SET points_awarded_at = COALESCE(points_awarded_at, created_at)
WHERE status = 'completed';

-- BEFORE UPDATE (was AFTER) so it can stamp the order itself in the same
-- write. Same 10 points per $1 of subtotal as before.
CREATE OR REPLACE FUNCTION public.award_points_on_completion()
RETURNS trigger AS $$
DECLARE
  earned INTEGER;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.user_id IS NOT NULL
     AND NEW.points_awarded_at IS NULL THEN
    earned := FLOOR(COALESCE(NEW.subtotal_amount, NEW.total_amount) * 10)::INTEGER;
    UPDATE public.profiles
    SET panino_points = panino_points + earned
    WHERE id = NEW.user_id;
    NEW.points_awarded_at := now();
    NEW.points_earned := earned;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_order_completed ON public.orders;
CREATE TRIGGER on_order_completed
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_points_on_completion();
