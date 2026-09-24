-- App-only "Secret Mob" menu and limited-time drops.
--
-- A category flagged is_secret is kept out of the menu grid and gets its own
-- banner instead (like catering). Any item can be a drop by giving it a
-- window: before drop_starts_at it's shown as "coming soon" but can't be
-- ordered, after drop_ends_at it disappears. Leave both empty for an item
-- that's simply always on the secret menu.
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS is_secret BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS drop_starts_at TIMESTAMPTZ;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS drop_ends_at TIMESTAMPTZ;
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_drop_window_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_drop_window_check
  CHECK (drop_starts_at IS NULL OR drop_ends_at IS NULL OR drop_ends_at > drop_starts_at);

-- The app checks the window too, but this is the one that can't be skipped:
-- a customer can't order a drop before it starts or after it ends. Staff
-- (Studio, the kitchen) are exempt.
CREATE OR REPLACE FUNCTION public.enforce_drop_window()
RETURNS trigger AS $$
DECLARE
  item RECORD;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_staff() THEN
    RETURN NEW;
  END IF;
  SELECT name, drop_starts_at, drop_ends_at INTO item FROM public.menu_items WHERE id = NEW.menu_item_id;
  IF item.drop_starts_at IS NOT NULL AND now() < item.drop_starts_at THEN
    RAISE EXCEPTION '% hasn''t dropped yet.', item.name;
  END IF;
  IF item.drop_ends_at IS NOT NULL AND now() >= item.drop_ends_at THEN
    RAISE EXCEPTION 'The % drop has ended.', item.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS enforce_drop_window ON public.order_items;
CREATE TRIGGER enforce_drop_window
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_drop_window();

-- A Secret Mob category at every location, with one sample item that's
-- switched off. To run a drop: edit the sample (name, description, price,
-- photo), set drop_starts_at / drop_ends_at, and set is_available = true.
DO $$
DECLARE
  loc RECORD;
  cat_id UUID;
BEGIN
  FOR loc IN SELECT id FROM public.locations LOOP
    SELECT id INTO cat_id FROM public.menu_categories WHERE location_id = loc.id AND is_secret LIMIT 1;
    IF cat_id IS NULL THEN
      INSERT INTO public.menu_categories (location_id, name, sort_order, is_secret)
      VALUES (loc.id, 'The Secret Mob', 99, true)
      RETURNING id INTO cat_id;

      INSERT INTO public.menu_items (category_id, location_id, name, description, base_price, is_available)
      VALUES (
        cat_id, loc.id, 'Sample Drop',
        'Replace this with your drop -- only in the app, only while it lasts.',
        20.00, false
      );
    END IF;
  END LOOP;
END $$;
