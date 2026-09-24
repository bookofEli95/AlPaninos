-- Catering (phase 1): packaged platters ordered ahead for groups.
--
-- Rules enforced in the app (apps/mobile/lib/catering.ts + cart.tsx):
-- order by 6 PM for the next day or later (no ASAP), a $100 minimum after
-- discounts, registered accounts only, delivery up to 60 km. There's no
-- card payment yet, so every catering order is confirmed by phone first --
-- catering_confirmed_at stays NULL ("Awaiting confirmation") until staff set it.

-- A category flag rather than matching on its name, so the menu can keep
-- catering out of the everyday category grid (it gets its own banner) and
-- a rename in Studio never breaks anything.
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS is_catering BOOLEAN NOT NULL DEFAULT false;

-- Per item: whether it's a catering package (which is what switches the
-- whole cart into catering rules), and how many people it feeds.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_catering BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS serves_min INTEGER;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS serves_max INTEGER;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_catering BOOLEAN NOT NULL DEFAULT false;
-- Company / event name, shown on the receipt (for expense reports).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS catering_company TEXT;
-- Floor/suite and drop-off instructions for catering deliveries.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS catering_notes TEXT;
-- Set by staff once they've called the customer to confirm.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS catering_confirmed_at TIMESTAMPTZ;

-- The starter packages, built from what's already on the menu. Created for
-- every location (categories and items are per location), and skipped
-- item-by-item if they already exist, so re-running this is harmless.
--
-- An option list of "@sandwiches" or "@drinks" is filled from that
-- location's actual menu (every Mob sandwich and wrap / every canned drink),
-- so the choices always match what the store really sells.
DO $$
DECLARE
  loc RECORD;
  cat_id UUID;
  item_id UUID;
  grp_id UUID;
  pkg JSONB;
  grp JSONB;
  opt JSONB;
  opt_name TEXT;
  g_sort INT;
  o_sort INT;
  packages JSONB := $json$
  [
    {
      "name": "The Panino Board",
      "description": "Five of our paninos, cut in half and labeled -- 10 halves, served with dipping sauces. Order by 6 PM for next-day pickup or delivery.",
      "price": 115.00, "serves_min": 8, "serves_max": 10,
      "groups": [
        { "name": "Choose 5 Paninos", "required": true, "min": 5, "max": 5, "options": "@sandwiches" },
        { "name": "Dipping Sauces", "required": false, "min": 0, "max": 4, "options": [
          { "name": "Paninos Fancy Sauce", "default": true },
          { "name": "Garlic Aioli", "default": true },
          { "name": "Tzatziki", "default": true },
          { "name": "Hot Sauce", "default": true }
        ] }
      ]
    },
    {
      "name": "The Big Panino Board",
      "description": "Ten of our paninos, cut in half and labeled -- 20 halves, served with dipping sauces. Order by 6 PM for next-day pickup or delivery.",
      "price": 225.00, "serves_min": 16, "serves_max": 20,
      "groups": [
        { "name": "Choose 10 Paninos", "required": true, "min": 10, "max": 10, "options": "@sandwiches" },
        { "name": "Dipping Sauces", "required": false, "min": 0, "max": 4, "options": [
          { "name": "Paninos Fancy Sauce", "default": true },
          { "name": "Garlic Aioli", "default": true },
          { "name": "Tzatziki", "default": true },
          { "name": "Hot Sauce", "default": true }
        ] }
      ]
    },
    {
      "name": "The Party Fries Tray",
      "description": "A full catering tray of our loaded fries. Order by 6 PM for next-day pickup or delivery.",
      "price": 65.00, "serves_min": 8, "serves_max": 10,
      "groups": [
        { "name": "Choose Your Fries", "required": true, "min": 1, "max": 1, "options": [
          { "name": "Greek Fries", "default": true },
          { "name": "Philly Fries", "price": 4.00 },
          { "name": "Pulled Pork Fries", "price": 4.00 }
        ] }
      ]
    },
    {
      "name": "The Family Salad Bowl",
      "description": "A large bowl of salad for the group. Order by 6 PM for next-day pickup or delivery.",
      "price": 55.00, "serves_min": 8, "serves_max": 10,
      "groups": [
        { "name": "Choose Your Salad", "required": true, "min": 1, "max": 1, "options": [
          { "name": "Greek Salad", "default": true },
          { "name": "Caesar Salad", "price": 4.00 }
        ] }
      ]
    },
    {
      "name": "The Italian Sweets Box",
      "description": "10 dessert squares of our tiramisu and toasted coconut cheesecake. Order by 6 PM for next-day pickup or delivery.",
      "price": 85.00, "serves_min": 10, "serves_max": 10,
      "groups": [
        { "name": "Choose Your Mix", "required": true, "min": 1, "max": 1, "options": [
          { "name": "Half Tiramisu, Half Cheesecake", "default": true },
          { "name": "All Tiramisu" },
          { "name": "All Toasted Coconut Cheesecake" }
        ] }
      ]
    },
    {
      "name": "The Drinks Pack",
      "description": "12 cold cans for the group. Order by 6 PM for next-day pickup or delivery.",
      "price": 26.00, "serves_min": 12, "serves_max": 12,
      "groups": [
        { "name": "Choose Up To 3 Flavours", "required": true, "min": 1, "max": 3, "options": "@drinks" }
      ]
    }
  ]
  $json$;
BEGIN
  FOR loc IN SELECT id FROM public.locations LOOP
    SELECT id INTO cat_id
    FROM public.menu_categories
    WHERE location_id = loc.id AND is_catering
    LIMIT 1;

    IF cat_id IS NULL THEN
      INSERT INTO public.menu_categories (location_id, name, sort_order, is_catering)
      VALUES (loc.id, 'Catering & Platters', 100, true)
      RETURNING id INTO cat_id;
    END IF;

    FOR pkg IN SELECT * FROM jsonb_array_elements(packages) LOOP
      IF EXISTS (
        SELECT 1 FROM public.menu_items WHERE category_id = cat_id AND name = pkg->>'name'
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.menu_items (
        category_id, location_id, name, description, base_price,
        is_available, is_catering, serves_min, serves_max
      ) VALUES (
        cat_id, loc.id, pkg->>'name', pkg->>'description', (pkg->>'price')::numeric,
        true, true, (pkg->>'serves_min')::int, (pkg->>'serves_max')::int
      )
      RETURNING id INTO item_id;

      g_sort := 0;
      FOR grp IN SELECT * FROM jsonb_array_elements(pkg->'groups') LOOP
        INSERT INTO public.modifier_groups (menu_item_id, name, is_required, min_selections, max_selections, sort_order)
        VALUES (item_id, grp->>'name', (grp->>'required')::boolean, (grp->>'min')::int, (grp->>'max')::int, g_sort)
        RETURNING id INTO grp_id;
        g_sort := g_sort + 1;
        o_sort := 0;

        IF jsonb_typeof(grp->'options') = 'string' THEN
          -- Filled from this location's real menu.
          FOR opt_name IN
            SELECT mi.name
            FROM public.menu_items mi
            JOIN public.menu_categories mc ON mc.id = mi.category_id
            WHERE mi.location_id = loc.id
              AND NOT mi.is_catering
              AND COALESCE(mi.is_available, true)
              AND (
                (grp->>'options' = '@sandwiches' AND mc.name IN ('The Mob', 'Al''s Wraps'))
                OR (grp->>'options' = '@drinks' AND mc.name = 'Drinks' AND mi.name <> 'Water')
              )
            ORDER BY mc.name DESC, mi.name
          LOOP
            INSERT INTO public.modifier_options (group_id, name, price_adjustment, sort_order, is_default)
            VALUES (grp_id, opt_name, 0, o_sort, false);
            o_sort := o_sort + 1;
          END LOOP;
        ELSE
          FOR opt IN SELECT * FROM jsonb_array_elements(grp->'options') LOOP
            INSERT INTO public.modifier_options (group_id, name, price_adjustment, sort_order, is_default)
            VALUES (
              grp_id,
              opt->>'name',
              COALESCE((opt->>'price')::numeric, 0),
              o_sort,
              COALESCE((opt->>'default')::boolean, false)
            );
            o_sort := o_sort + 1;
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
