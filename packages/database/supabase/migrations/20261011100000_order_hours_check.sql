-- Orders only for when the store is open. The app already stops it (no
-- "ASAP" while a store is closed -- lib/orderTiming.ts / cart.tsx -- and
-- only times inside opening hours to pick from); this is the database
-- making sure, whatever sends the order (an out-of-date app included):
--   * an ASAP order (no requested time) needs the store open right now;
--   * a scheduled order's time has to be inside that day's hours, and not
--     already in the past.
-- Catering has its own booking rules (order by 6 PM the day before -- see
-- place_order) and is left alone, as is a store with no hours on file.
-- Times are the stores' own (Ontario), like order_local_time().

CREATE OR REPLACE FUNCTION public.check_order_within_hours()
RETURNS TRIGGER AS $$
DECLARE
  store_hours JSONB;
  target_local TIMESTAMP;
  day_hours JSONB;
  open_t TIME;
  close_t TIME;
BEGIN
  IF NEW.is_catering THEN
    RETURN NEW;
  END IF;

  SELECT hours INTO store_hours FROM public.locations WHERE id = NEW.location_id;
  IF store_hours IS NULL OR jsonb_typeof(store_hours) <> 'object' THEN
    RETURN NEW;
  END IF;

  IF NEW.requested_ready_at IS NOT NULL AND NEW.requested_ready_at < now() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'That pickup time has already passed. Please choose another time.';
  END IF;

  target_local := COALESCE(NEW.requested_ready_at, now()) AT TIME ZONE 'America/Toronto';
  day_hours := store_hours -> to_char(target_local, 'FMday');

  IF day_hours IS NULL OR jsonb_typeof(day_hours) <> 'object' THEN
    IF NEW.requested_ready_at IS NULL THEN
      RAISE EXCEPTION 'We''re closed right now. Please choose a time when the store is open to order ahead.';
    END IF;
    RAISE EXCEPTION 'The store is closed at that time. Please choose another time.';
  END IF;

  open_t := (day_hours ->> 'open')::TIME;
  close_t := (day_hours ->> 'close')::TIME;

  IF NEW.requested_ready_at IS NULL THEN
    IF target_local::TIME < open_t OR target_local::TIME >= close_t THEN
      RAISE EXCEPTION 'We''re closed right now. Please choose a time when the store is open to order ahead.';
    END IF;
  ELSIF target_local::TIME < open_t OR target_local::TIME > close_t THEN
    RAISE EXCEPTION 'The store is closed at that time. Please choose another time.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_order_hours_check ON public.orders;
CREATE TRIGGER on_order_hours_check
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.check_order_within_hours();
