-- The real catering menu, priced per person (the quantity is the number
-- of people), replacing the boards and packs:
--   Al's Classic Luncheon $18.50, Build-A-Panino $22, Al's Taco Bar $25,
--   Al's Texas Feast $26, Pasta Alla Al $27, Al Panopolous $31 -- each with
--   its choices (salad and dessert upgrades, pasta/sauce/meat...) and the
--   per-person add-ons (packaging, cutlery, drinks, gluten-free).
-- "Al Makes It Your Way" (fully custom, 48 hours' notice) isn't a package:
-- the website and app send people to contact the store for it.
-- The old packages are hidden, not deleted, so past orders keep them.
-- No catering minimum any more (place_order below), and per-person
-- packages can be for up to 1,000 people.

-- 1. Per-person pricing ------------------------------------------------------
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS per_person BOOLEAN NOT NULL DEFAULT false;

-- 2. The old packages come off the menu ---------------------------------------
UPDATE public.menu_items SET is_available = false
WHERE is_catering
  AND name IN ('The Panino Board', 'The Big Panino Board', 'The Drinks Pack', 'The Family Salad Bowl', 'The Party Fries Tray', 'The Italian Sweets Box');

-- 3. The new packages, at every store with a catering category -------------
-- A choice group and its options, and the groups under an option (shown
-- once that option is picked), straight from the menu below.
CREATE FUNCTION pg_temp.add_catering_group(p_item UUID, p_parent UUID, p_group JSONB, p_sort INT)
RETURNS VOID AS $$
DECLARE
  v_group UUID;
  v_option UUID;
  o JSONB;
  g JSONB;
  i INT := 0;
  j INT;
BEGIN
  INSERT INTO public.modifier_groups (menu_item_id, parent_option_id, name, is_required, min_selections, max_selections, sort_order)
  VALUES (p_item, p_parent, p_group->>'name', (p_group->>'required')::boolean, (p_group->>'min')::int, (p_group->>'max')::int, p_sort)
  RETURNING id INTO v_group;
  FOR o IN SELECT * FROM jsonb_array_elements(p_group->'options') LOOP
    INSERT INTO public.modifier_options (group_id, name, price_adjustment, is_default, sort_order)
    VALUES (v_group, o->>'name', (o->>'price')::numeric, (o->>'default')::boolean, i)
    RETURNING id INTO v_option;
    j := 0;
    FOR g IN SELECT * FROM jsonb_array_elements(COALESCE(o->'groups', '[]'::jsonb)) LOOP
      PERFORM pg_temp.add_catering_group(p_item, v_option, g, j);
      j := j + 1;
    END LOOP;
    i := i + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  menu JSONB := '[
  {
    "name": "Al''s Classic Luncheon",
    "price": 18.5,
    "description": "An assorted sandwich box of our most popular sandwiches, with Al''s seasonal salad and fresh baked cookies. Sandwiches on their own $17 per person.",
    "groups": [
      {
        "name": "Package",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Sandwiches, salad & cookies",
            "price": 0,
            "default": true,
            "groups": [
              {
                "name": "Salad",
                "required": true,
                "min": 1,
                "max": 1,
                "options": [
                  {
                    "name": "Al''s seasonal salad",
                    "price": 0,
                    "default": true
                  },
                  {
                    "name": "Al''s Famous Hot Potato Salad",
                    "price": 4,
                    "default": false
                  },
                  {
                    "name": "Caesar Salad",
                    "price": 4,
                    "default": false
                  },
                  {
                    "name": "Berry & Goat Cheese Salad",
                    "price": 4,
                    "default": false
                  },
                  {
                    "name": "Coleslaw",
                    "price": 4,
                    "default": false
                  },
                  {
                    "name": "Pasta Salad",
                    "price": 4,
                    "default": false
                  }
                ]
              },
              {
                "name": "Dessert",
                "required": true,
                "min": 1,
                "max": 1,
                "options": [
                  {
                    "name": "Fresh baked cookies",
                    "price": 0,
                    "default": true
                  },
                  {
                    "name": "Mixed berry cobbler with French vanilla custard",
                    "price": 2.5,
                    "default": false
                  },
                  {
                    "name": "Tiramisu",
                    "price": 2.5,
                    "default": false
                  },
                  {
                    "name": "Al''s seasonal dessert",
                    "price": 2.5,
                    "default": false
                  }
                ]
              }
            ]
          },
          {
            "name": "Sandwiches only",
            "price": -1.5,
            "default": false
          }
        ]
      },
      {
        "name": "Favourites to include (optional)",
        "required": false,
        "min": 0,
        "max": 11,
        "options": [
          {
            "name": "Fat Tony",
            "price": 0,
            "default": false
          },
          {
            "name": "Patty Two Times",
            "price": 0,
            "default": false
          },
          {
            "name": "Big Al",
            "price": 0,
            "default": false
          },
          {
            "name": "Diamond Jim",
            "price": 0,
            "default": false
          },
          {
            "name": "Spicy Spyro",
            "price": 0,
            "default": false
          },
          {
            "name": "Virgin Mary (vegetarian)",
            "price": 0,
            "default": false
          },
          {
            "name": "The Butcher",
            "price": 0,
            "default": false
          },
          {
            "name": "The Barber",
            "price": 0,
            "default": false
          },
          {
            "name": "The Chooch",
            "price": 0,
            "default": false
          },
          {
            "name": "Barry Goldstein",
            "price": 0,
            "default": false
          },
          {
            "name": "The Napoleon",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  },
  {
    "name": "Build-A-Panino",
    "price": 22,
    "description": "Build your own sandwiches or Greek pitas: Big Al (mama''s meatballs), Fat Tony (chicken cutlet parm), The Chooch and Nonos chicken & gyro pita, with the fixings on the side, Al''s seasonal salad and fresh baked cookies.",
    "groups": [
      {
        "name": "Bread",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Pre-sliced focaccia",
            "price": 0,
            "default": true
          },
          {
            "name": "Hoagies",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "The Chooch meats (pick 2)",
        "required": true,
        "min": 2,
        "max": 2,
        "options": [
          {
            "name": "Smoked ham",
            "price": 0,
            "default": false
          },
          {
            "name": "Mortadella",
            "price": 0,
            "default": false
          },
          {
            "name": "Chicken",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "Salad",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Al''s seasonal salad",
            "price": 0,
            "default": true
          },
          {
            "name": "Al''s Famous Hot Potato Salad",
            "price": 4,
            "default": false
          },
          {
            "name": "Caesar Salad",
            "price": 4,
            "default": false
          },
          {
            "name": "Berry & Goat Cheese Salad",
            "price": 4,
            "default": false
          },
          {
            "name": "Coleslaw",
            "price": 4,
            "default": false
          },
          {
            "name": "Pasta Salad",
            "price": 4,
            "default": false
          }
        ]
      },
      {
        "name": "Dessert",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Fresh baked cookies",
            "price": 0,
            "default": true
          },
          {
            "name": "Mixed berry cobbler with French vanilla custard",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Tiramisu",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Al''s seasonal dessert",
            "price": 2.5,
            "default": false
          }
        ]
      },
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  },
  {
    "name": "Al''s Taco Bar",
    "price": 25,
    "description": "Build your own tacos: Baja chicken and taco-seasoned ground beef, flour tortillas, shredded iceberg, diced tomato, red onion, pico de gallo, guacamole, shredded cheese, sour cream, salsa and refried beans, with citrus salad and fresh baked cookies.",
    "groups": [
      {
        "name": "Dessert",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Fresh baked cookies",
            "price": 0,
            "default": true
          },
          {
            "name": "Mixed berry cobbler with French vanilla custard",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Tiramisu",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Al''s seasonal dessert",
            "price": 2.5,
            "default": false
          }
        ]
      },
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  },
  {
    "name": "Al''s Texas Feast",
    "price": 26,
    "description": "Al''s BBQ: smoked ancho chili pulled pork, pre-sliced Cajun-seasoned focaccia, hot sauce, smoky BBQ sauce, coleslaw, Al''s famous potato salad, southern baked beans and fresh baked cookies.",
    "groups": [
      {
        "name": "Dessert",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Fresh baked cookies",
            "price": 0,
            "default": true
          },
          {
            "name": "Mixed berry cobbler with French vanilla custard",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Tiramisu",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Al''s seasonal dessert",
            "price": 2.5,
            "default": false
          }
        ]
      },
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  },
  {
    "name": "Pasta Alla Al",
    "price": 27,
    "description": "Al''s Italian catering: your pasta, sauce and meat, grated and shredded Parmigiano Reggiano, garlic butter focaccia, Caesar salad and fresh baked cookies.",
    "groups": [
      {
        "name": "Pasta",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Penne",
            "price": 0,
            "default": true
          },
          {
            "name": "Rotini",
            "price": 0,
            "default": false
          },
          {
            "name": "Rigatoni",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "Sauce",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Marinara",
            "price": 0,
            "default": true
          },
          {
            "name": "Blush",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "Meat",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Meatballs",
            "price": 0,
            "default": true
          },
          {
            "name": "Grilled chicken",
            "price": 0,
            "default": false
          }
        ]
      },
      {
        "name": "Dessert",
        "required": true,
        "min": 1,
        "max": 1,
        "options": [
          {
            "name": "Fresh baked cookies",
            "price": 0,
            "default": true
          },
          {
            "name": "Mixed berry cobbler with French vanilla custard",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Tiramisu",
            "price": 2.5,
            "default": false
          },
          {
            "name": "Al''s seasonal dessert",
            "price": 2.5,
            "default": false
          }
        ]
      },
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  },
  {
    "name": "Al Panopolous",
    "price": 31,
    "description": "Classic Greek-style catering: 8 oz Greek-marinated chicken souvlaki, Greek salad with feta and burnt lemon oil, Mediterranean rice, lemon roasted potatoes, Mediterranean focaccia and grilled pita, tzatziki and tirokafteri (spicy roasted red pepper feta dip), and honey pistachio Greek yogurt.",
    "groups": [
      {
        "name": "Add-ons (per person)",
        "required": false,
        "min": 0,
        "max": 4,
        "options": [
          {
            "name": "Gluten-free options (we''ll call to arrange)",
            "price": 0,
            "default": false
          },
          {
            "name": "Individual packaging",
            "price": 0.5,
            "default": false
          },
          {
            "name": "Cutlery, napkins & plates",
            "price": 1,
            "default": false
          },
          {
            "name": "Assorted drinks (pop, water, bubbly)",
            "price": 2.5,
            "default": false
          }
        ]
      }
    ]
  }
]'::jsonb;
  pkg JSONB;
  g JSONB;
  cat RECORD;
  v_item UUID;
  n INT;
BEGIN
  FOR cat IN SELECT id, location_id FROM public.menu_categories WHERE is_catering LOOP
    FOR pkg IN SELECT * FROM jsonb_array_elements(menu) LOOP
      -- Already there (run twice): leave it as it is.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.menu_items WHERE location_id = cat.location_id AND is_catering AND name = pkg->>'name'
      );
      INSERT INTO public.menu_items (location_id, category_id, name, description, base_price, is_available, is_catering, per_person)
      VALUES (cat.location_id, cat.id, pkg->>'name', pkg->>'description', (pkg->>'price')::numeric, true, true, true)
      RETURNING id INTO v_item;
      n := 0;
      FOR g IN SELECT * FROM jsonb_array_elements(pkg->'groups') LOOP
        PERFORM pg_temp.add_catering_group(v_item, NULL, g, n);
        n := n + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- 4. place_order(): the checkout_and_loyalty_upgrades version with the
-- $100 catering minimum gone, and the quantity checked once the item is
-- known (up to 99 of a regular item, 1,000 people for per-person catering),
-- and the catering notes (dietary needs, drop-off) kept for pickup orders
-- too, not only deliveries.
CREATE OR REPLACE FUNCTION public.place_order(p JSONB)
RETURNS JSONB AS $$
DECLARE
  uid UUID := auth.uid();
  loc RECORD;
  v_order_type public.order_type;
  v_requested TIMESTAMPTZ;
  line JSONB;
  line_no INT := 0;
  item RECORD;
  grp RECORD;
  opt RECORD;
  reward RECORD;
  v_qty INT;
  v_option_ids UUID[];
  v_unit NUMERIC;
  v_line_total NUMERIC;
  v_reward_code TEXT;
  v_reward_codes TEXT[] := '{}';
  v_is_catering BOOLEAN := false;
  v_lines JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  -- promo
  v_promo_code TEXT := NULLIF(trim(p->>'promo_code'), '');
  promo RECORD;
  -- Copied out of `promo` once it's found: a record that was never
  -- assigned can't be read, even in a branch that isn't taken.
  v_promo_id UUID;
  v_promo_owner UUID;
  v_promo_used TEXT;
  v_scope_ids UUID[];
  v_patterns TEXT[];
  v_paid_subtotal NUMERIC := 0;
  v_eligible_subtotal NUMERIC := 0;
  v_eligible_count INT := 0;
  v_discount NUMERIC := 0;
  v_discounted NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_expected NUMERIC;
  v_local_now TIMESTAMP;
  v_earliest TIMESTAMP;
  v_order_id UUID;
  v_item_id UUID;
  v_count INT;
  v_min INT;
  v_quantity_mode BOOLEAN;
  v_client_key TEXT := NULLIF(trim(p->>'client_key'), '');
  prior RECORD;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in (or continue as a guest) to place an order.';
  END IF;

  -- 0. The same checkout sent again (the phone lost signal after the order
  -- went in, and they tapped Place Order again): hand back the order that
  -- already exists instead of making a second one. The lock makes two
  -- copies arriving at once take turns.
  IF v_client_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(uid::text || ':' || v_client_key));
    SELECT id, subtotal_amount, discount_amount, tax_amount, total_amount, is_catering INTO prior
    FROM public.orders WHERE user_id = uid AND client_key = v_client_key;
    IF prior.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'order_id', prior.id,
        'subtotal', prior.subtotal_amount,
        'discount', prior.discount_amount,
        'tax', prior.tax_amount,
        'total', prior.total_amount,
        'is_catering', prior.is_catering,
        'already_placed', true
      );
    END IF;
  END IF;

  SELECT id, tax_rate INTO loc FROM public.locations WHERE id = (p->>'location_id')::uuid;
  IF loc.id IS NULL THEN
    RAISE EXCEPTION 'That store could not be found.';
  END IF;

  v_order_type := COALESCE(NULLIF(p->>'order_type', ''), 'pickup')::public.order_type;
  IF v_order_type = 'delivery' AND NULLIF(trim(p->>'delivery_address'), '') IS NULL THEN
    RAISE EXCEPTION 'Please add a delivery address.';
  END IF;
  v_requested := NULLIF(p->>'requested_ready_at', '')::timestamptz;

  IF jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'items') = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  -- 1. Price every line from the menu.
  FOR line IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    line_no := line_no + 1;
    v_qty := COALESCE((line->>'quantity')::int, 0);

    SELECT mi.id, mi.name, mi.base_price, mi.is_catering, mi.category_id, mi.is_available,
           mi.drop_starts_at, mi.drop_ends_at, mi.per_person, mc.name AS category_name
    INTO item
    FROM public.menu_items mi
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE mi.id = (line->>'menu_item_id')::uuid AND mi.location_id = loc.id;
    IF item.id IS NULL THEN
      RAISE EXCEPTION 'An item in your cart isn''t sold at this store anymore. Please remove it and try again.';
    END IF;
    IF v_qty < 1 OR v_qty > (CASE WHEN item.per_person THEN 1000 ELSE 99 END) THEN
      RAISE EXCEPTION 'Item % has an invalid quantity.', line_no;
    END IF;
    IF NOT COALESCE(item.is_available, true) THEN
      RAISE EXCEPTION '% isn''t available right now. Please remove it and try again.', item.name;
    END IF;
    IF item.drop_starts_at IS NOT NULL AND now() < item.drop_starts_at THEN
      RAISE EXCEPTION '% hasn''t dropped yet.', item.name;
    END IF;
    IF item.drop_ends_at IS NOT NULL AND now() >= item.drop_ends_at THEN
      RAISE EXCEPTION 'The % drop has ended. Please remove it and try again.', item.name;
    END IF;
    v_is_catering := v_is_catering OR COALESCE(item.is_catering, false);

    SELECT COALESCE(array_agg(value::uuid), '{}') INTO v_option_ids
    FROM jsonb_array_elements_text(COALESCE(line->'option_ids', '[]'::jsonb));

    -- Every chosen option must belong to one of this item's option groups.
    IF EXISTS (
      SELECT 1 FROM unnest(v_option_ids) AS chosen(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.modifier_options o
        JOIN public.modifier_groups g ON g.id = o.group_id
        WHERE o.id = chosen.id AND g.menu_item_id = item.id
      )
    ) THEN
      RAISE EXCEPTION 'An option on % isn''t available anymore. Please remove it and add it again.', item.name;
    END IF;

    -- Each group that applies (top-level, or opened by a chosen option):
    -- enough picks, not too many, and repeats only where the app offers
    -- -/+ steppers (see item/[id].tsx).
    FOR grp IN
      SELECT g.* FROM public.modifier_groups g
      WHERE g.menu_item_id = item.id
        AND (g.parent_option_id IS NULL OR g.parent_option_id = ANY(v_option_ids))
    LOOP
      SELECT COUNT(*) INTO v_count
      FROM unnest(v_option_ids) AS chosen(id)
      JOIN public.modifier_options o ON o.id = chosen.id
      WHERE o.group_id = grp.id;

      v_min := COALESCE(NULLIF(grp.min_selections, 0), CASE WHEN grp.is_required THEN 1 ELSE 0 END);
      IF v_count < v_min THEN
        RAISE EXCEPTION 'Please choose % for %.', grp.name, item.name;
      END IF;
      IF COALESCE(grp.max_selections, 0) > 0 AND v_count > grp.max_selections THEN
        RAISE EXCEPTION 'Too many choices for % on %.', grp.name, item.name;
      END IF;

      v_quantity_mode := COALESCE(grp.allow_quantity, false)
        OR (COALESCE(item.is_catering, false) AND COALESCE(grp.max_selections, 0) > 1);
      IF NOT v_quantity_mode AND EXISTS (
        SELECT 1 FROM unnest(v_option_ids) AS chosen(id)
        JOIN public.modifier_options o ON o.id = chosen.id
        WHERE o.group_id = grp.id
        GROUP BY chosen.id HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'An option on % was picked twice.', item.name;
      END IF;
    END LOOP;

    SELECT item.base_price + COALESCE(SUM(o.price_adjustment), 0) INTO v_unit
    FROM unnest(v_option_ids) AS chosen(id)
    JOIN public.modifier_options o ON o.id = chosen.id;

    -- A reward line: free, but only with this customer's own unused
    -- pick-an-item prize code that fits this item.
    v_reward_code := NULLIF(trim(line->>'reward_code'), '');
    IF v_reward_code IS NOT NULL THEN
      IF v_qty <> 1 THEN
        RAISE EXCEPTION 'A free reward item can only be added once.';
      END IF;
      IF lower(v_reward_code) = ANY(SELECT lower(c) FROM unnest(v_reward_codes) c) THEN
        RAISE EXCEPTION 'That reward was already used on another item.';
      END IF;
      SELECT * INTO reward FROM public.promotions
      WHERE lower(code) = lower(v_reward_code) AND user_id = uid AND is_active
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1;
      IF reward.id IS NULL
         OR COALESCE(reward.discount_percent, 0) <> 100
         OR reward.category_name IS NULL
         OR lower(trim(item.category_name)) <> lower(trim(reward.category_name))
         OR (COALESCE(cardinality(reward.item_name_patterns), 0) > 0
             AND NOT lower(trim(item.name)) = ANY(SELECT lower(trim(x)) FROM unnest(reward.item_name_patterns) x))
      THEN
        RAISE EXCEPTION 'The reward on % can''t be used (it may have been used already).', item.name;
      END IF;
      v_reward_codes := v_reward_codes || reward.code;
      v_line_total := 0;
    ELSE
      v_line_total := v_unit * v_qty;
      v_paid_subtotal := v_paid_subtotal + v_line_total;
    END IF;

    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', item.id,
      'category_id', item.category_id,
      'name', item.name,
      'base_price', item.base_price,
      'quantity', v_qty,
      'total', v_line_total,
      'reward_code', v_reward_code,
      'special_instructions', NULLIF(trim(line->>'special_instructions'), ''),
      'option_ids', to_jsonb(v_option_ids)
    );
  END LOOP;

  -- 2. The applied promo -- same rules as evaluatePromo() in the app. A
  -- code whose rules aren't met takes $0 off and isn't recorded or spent.
  IF v_promo_code IS NOT NULL THEN
    SELECT * INTO promo FROM public.promotions
    WHERE lower(code) = lower(v_promo_code)
      AND is_active
      AND (expires_at IS NULL OR expires_at > now())
      AND (user_id IS NULL OR user_id = uid)
      AND (location_id IS NULL OR location_id = loc.id)
    LIMIT 1;
    IF promo.id IS NULL THEN
      RAISE EXCEPTION 'The promo code % isn''t valid anymore. Remove it and try again.', v_promo_code;
    END IF;
    v_promo_id := promo.id;
    v_promo_owner := promo.user_id;
    IF COALESCE(promo.single_use, true) AND EXISTS (
      SELECT 1 FROM public.orders WHERE user_id = uid AND lower(promo_code) = lower(promo.code)
    ) THEN
      RAISE EXCEPTION 'You''ve already used the code %.', promo.code;
    END IF;

    IF promo.order_type IS NULL OR promo.order_type = v_order_type THEN
      -- Category scope at this store (categories are per store).
      IF promo.category_id IS NOT NULL THEN
        v_scope_ids := ARRAY[promo.category_id];
      ELSIF promo.category_name IS NOT NULL OR COALESCE(cardinality(promo.category_names), 0) > 0 THEN
        SELECT COALESCE(array_agg(c.id), '{}') INTO v_scope_ids
        FROM public.menu_categories c
        WHERE c.location_id = loc.id
          AND lower(trim(c.name)) IN (
            SELECT lower(trim(n)) FROM unnest(COALESCE(promo.category_names, '{}') || promo.category_name) n
            WHERE n IS NOT NULL
          );
      ELSE
        v_scope_ids := NULL;
      END IF;
      SELECT COALESCE(array_agg(lower(trim(x))), '{}') INTO v_patterns
      FROM unnest(COALESCE(promo.item_name_patterns, '{}')) x;

      SELECT COALESCE(SUM((l->>'total')::numeric), 0), COALESCE(SUM((l->>'quantity')::int), 0)
      INTO v_eligible_subtotal, v_eligible_count
      FROM jsonb_array_elements(v_lines) l
      WHERE l->>'reward_code' IS NULL
        AND (v_scope_ids IS NULL OR (l->>'category_id')::uuid = ANY(v_scope_ids))
        AND (cardinality(v_patterns) = 0 OR lower(trim(l->>'name')) = ANY(v_patterns));

      -- "One sandwich only": the deal covers just the cheapest
      -- max_discounted_items qualifying items (each unit priced with its
      -- options), however many are in the cart.
      IF promo.max_discounted_items IS NOT NULL THEN
        SELECT COALESCE(SUM(u.unit_price), 0) INTO v_eligible_subtotal
        FROM (
          SELECT (l->>'total')::numeric / (l->>'quantity')::int AS unit_price
          FROM jsonb_array_elements(v_lines) l
          CROSS JOIN LATERAL generate_series(1, (l->>'quantity')::int)
          WHERE l->>'reward_code' IS NULL
            AND (l->>'quantity')::int > 0
            AND (v_scope_ids IS NULL OR (l->>'category_id')::uuid = ANY(v_scope_ids))
            AND (cardinality(v_patterns) = 0 OR lower(trim(l->>'name')) = ANY(v_patterns))
          ORDER BY 1
          LIMIT GREATEST(promo.max_discounted_items, 0)
        ) u;
      END IF;

      IF (promo.min_item_count IS NULL OR v_eligible_count >= promo.min_item_count)
         AND (promo.min_order_amount IS NULL OR v_paid_subtotal >= promo.min_order_amount)
         AND v_eligible_subtotal > 0 THEN
        v_discount := CASE
          WHEN promo.amount_off IS NOT NULL THEN LEAST(promo.amount_off, v_eligible_subtotal)
          ELSE v_eligible_subtotal * COALESCE(promo.discount_percent, 0) / 100
        END;
        IF promo.max_discount_amount IS NOT NULL THEN
          v_discount := LEAST(v_discount, promo.max_discount_amount);
        END IF;
        v_discount := round(LEAST(v_discount, v_paid_subtotal), 2);
        IF v_discount > 0 THEN
          v_promo_used := promo.code;
        END IF;
      END IF;
    END IF;
  END IF;

  v_discounted := GREATEST(0, v_subtotal - v_discount);
  v_tax := round(v_discounted * loc.tax_rate, 2);
  v_total := v_discounted + v_tax;

  -- 3. Catering rules.
  IF v_is_catering THEN
    IF v_requested IS NULL THEN
      RAISE EXCEPTION 'Please choose a date and time for your catering order.';
    END IF;
    v_local_now := now() AT TIME ZONE 'America/Toronto';
    v_earliest := date_trunc('day', v_local_now)
      + make_interval(days => CASE WHEN EXTRACT(HOUR FROM v_local_now) < 18 THEN 1 ELSE 2 END);
    IF (v_requested AT TIME ZONE 'America/Toronto') < v_earliest THEN
      RAISE EXCEPTION 'Catering needs to be ordered by 6 PM the day before. Please choose another date or time.';
    END IF;
  END IF;

  -- 4. The total the customer saw has to match.
  v_expected := NULLIF(p->>'expected_total', '')::numeric;
  IF v_expected IS NOT NULL AND abs(v_expected - v_total) > 0.01 THEN
    RAISE EXCEPTION 'PRICE_CHANGED' USING DETAIL = v_total::text;
  END IF;

  -- 5. Save it all.
  INSERT INTO public.orders (
    location_id, user_id, customer_name, customer_phone, customer_email,
    notify_email, notify_sms, subtotal_amount, discount_amount, tax_amount, total_amount,
    promo_code, requested_ready_at, estimated_ready_at, status, order_type, delivery_address,
    is_catering, catering_company, catering_notes, po_number, invoice_email, client_key
  ) VALUES (
    loc.id, uid, NULLIF(trim(p->>'customer_name'), ''), NULLIF(trim(p->>'customer_phone'), ''),
    NULLIF(trim(p->>'customer_email'), ''),
    COALESCE((p->>'notify_email')::boolean, true), COALESCE((p->>'notify_sms')::boolean, false),
    v_subtotal, v_discount, v_tax, v_total,
    COALESCE(v_promo_used, v_reward_codes[1]),
    v_requested, NULLIF(p->>'estimated_ready_at', '')::timestamptz, 'received', v_order_type,
    CASE WHEN v_order_type = 'delivery' THEN NULLIF(trim(p->>'delivery_address'), '') END,
    v_is_catering,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'catering_company'), '') END,
    CASE WHEN v_is_catering THEN left(NULLIF(trim(p->>'catering_notes'), ''), 2000) END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'po_number'), '') END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'invoice_email'), '') END,
    v_client_key
  )
  RETURNING id INTO v_order_id;

  FOR line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, total_price, special_instructions)
    VALUES (
      v_order_id, (line->>'menu_item_id')::uuid, (line->>'quantity')::int,
      (line->>'base_price')::numeric, (line->>'total')::numeric, line->>'special_instructions'
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.order_item_modifiers (order_item_id, modifier_option_id, price_adjustment)
    SELECT v_item_id, o.id, o.price_adjustment
    FROM jsonb_array_elements_text(line->'option_ids') AS chosen(id)
    JOIN public.modifier_options o ON o.id = chosen.id::uuid;
  END LOOP;

  -- 6. Spend the codes: this customer's own promo (if it took money off)
  -- and every reward used.
  IF v_promo_used IS NOT NULL AND v_promo_owner = uid THEN
    UPDATE public.promotions SET is_active = false WHERE id = v_promo_id;
  END IF;
  UPDATE public.promotions SET is_active = false
  WHERE user_id = uid AND lower(code) = ANY(SELECT lower(c) FROM unnest(v_reward_codes) c);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'total', v_total,
    'is_catering', v_is_catering
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO authenticated;
