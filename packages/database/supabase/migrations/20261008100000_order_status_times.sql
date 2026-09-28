-- When an order reached each stage, for the order screen ("Ready since
-- 3:13 PM", "Picked up at 3:25 PM"). Stamped by the database the first time
-- the kitchen moves an order to that status, so the app never has to guess.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.stamp_order_status_times()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'ready' AND NEW.ready_at IS NULL THEN
      NEW.ready_at := now();
    ELSIF NEW.status = 'out_for_delivery' AND NEW.out_for_delivery_at IS NULL THEN
      NEW.out_for_delivery_at := now();
    ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_order_status_times ON public.orders;
CREATE TRIGGER on_order_status_times
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.stamp_order_status_times();

-- Each store's phone number, for the order screen's Call button. Filled in
-- per store (Table Editor -> locations -> phone); the button only shows once
-- it's set.
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS phone TEXT;
