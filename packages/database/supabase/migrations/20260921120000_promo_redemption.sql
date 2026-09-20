-- Promotions can now actually discount an order at checkout, not just be
-- displayed. category_id null means the discount applies to the whole
-- cart; set, it applies only to items in that category (e.g. 25MOB ->
-- 25% off anything in "The Mob").
ALTER TABLE public.promotions ADD COLUMN discount_percent NUMERIC(5,2);
ALTER TABLE public.promotions ADD COLUMN category_id UUID REFERENCES public.menu_categories(id) ON DELETE CASCADE;

ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC(10,2);
ALTER TABLE public.orders ADD COLUMN promo_code TEXT;

-- Wires up the 25MOB code to 25% off "The Mob" category. Updates it if the
-- owner already created the row via the Deals screen/Studio (title/code
-- only, before discount_percent/category_id existed); inserts it fresh
-- otherwise.
DO $$
DECLARE
  mob_category_id UUID;
  mob_location_id UUID;
BEGIN
  SELECT id, location_id INTO mob_category_id, mob_location_id
  FROM public.menu_categories WHERE name = 'The Mob' LIMIT 1;

  IF mob_category_id IS NOT NULL THEN
    UPDATE public.promotions
    SET category_id = mob_category_id, discount_percent = 25, is_active = true
    WHERE code = '25MOB';

    IF NOT FOUND THEN
      INSERT INTO public.promotions (location_id, category_id, title, description, code, discount_percent, is_active)
      VALUES (
        mob_location_id,
        mob_category_id,
        '25% Off The Mob',
        'Use code 25MOB for 25% off any Mob sandwich.',
        '25MOB',
        25,
        true
      );
    END IF;
  END IF;
END $$;
