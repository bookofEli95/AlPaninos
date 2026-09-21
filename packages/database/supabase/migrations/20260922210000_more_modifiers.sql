-- Adds "Options" modifier groups to four Mob sandwiches that didn't have
-- any yet. Matched to items by ingredient overlap with their description:
--   Patty Two Times: cranberry aioli, brie, arugula, green apple, bacon jam
--   Soprano: pepperoni, smoked ham, mozzarella/parm
--   Spicy Spyro: roasted garlic aioli, hot sauce, bacon, arugula, roasted
--     peppers, goat cheese -- Sub Cutlet swaps its grilled chicken for a cutlet
--   The Accountant: corned beef, swiss cheese, Russian dressing (a Reuben)
-- Applied to every location's copy of each item (menu_items.name is
-- duplicated per location, not a single shared row), same as how
-- import-menu.cjs matches items across locations by name.
DO $$
DECLARE
  item RECORD;
  new_group_id UUID;
BEGIN
  FOR item IN SELECT id FROM public.menu_items WHERE name = 'Patty Two Times' LOOP
    INSERT INTO public.modifier_groups (menu_item_id, name, is_required, min_selections, max_selections)
    VALUES (item.id, 'Options', false, 0, 11)
    RETURNING id INTO new_group_id;

    INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES
      (new_group_id, 'No Cranberry Aioli', 0),
      (new_group_id, 'No Brie', 0),
      (new_group_id, 'No Arugula', 0),
      (new_group_id, 'No Tomato', 0),
      (new_group_id, 'No Bacon', 0),
      (new_group_id, 'No Bacon Jam', 0),
      (new_group_id, 'No Green Apple', 0),
      (new_group_id, 'Extra Brie', 3.00),
      (new_group_id, 'Add Bacon', 3.00),
      (new_group_id, 'Add Chicken', 5.00),
      (new_group_id, 'Sub For Halal Beef Bacon', 2.50);
  END LOOP;

  FOR item IN SELECT id FROM public.menu_items WHERE name = 'Soprano' LOOP
    INSERT INTO public.modifier_groups (menu_item_id, name, is_required, min_selections, max_selections)
    VALUES (item.id, 'Options', false, 0, 5)
    RETURNING id INTO new_group_id;

    INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES
      (new_group_id, 'No Cheese', 0),
      (new_group_id, 'Extra Cheese', 3.00),
      (new_group_id, 'Extra Ham', 4.00),
      (new_group_id, 'No Pepperoni', 0),
      (new_group_id, 'Extra Pepperoni', 3.00);
  END LOOP;

  FOR item IN SELECT id FROM public.menu_items WHERE name = 'Spicy Spyro' LOOP
    INSERT INTO public.modifier_groups (menu_item_id, name, is_required, min_selections, max_selections)
    VALUES (item.id, 'Options', false, 0, 12)
    RETURNING id INTO new_group_id;

    INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES
      (new_group_id, 'No Ricotta', 0),
      (new_group_id, 'No Arugula', 0),
      (new_group_id, 'No Roasted Red Pepper', 0),
      (new_group_id, 'No Cheese', 0),
      (new_group_id, 'No Roasted Garlic Aioli', 0),
      (new_group_id, 'No Bacon', 0),
      (new_group_id, 'No Onion', 0),
      (new_group_id, 'Extra Cheese', 3.00),
      (new_group_id, 'Add Bacon', 3.00),
      (new_group_id, 'Sub Cutlet', 0),
      (new_group_id, 'No Hot Sauce', 0),
      (new_group_id, 'Sub For Halal Beef Bacon', 2.50);
  END LOOP;

  FOR item IN SELECT id FROM public.menu_items WHERE name = 'The Accountant' LOOP
    INSERT INTO public.modifier_groups (menu_item_id, name, is_required, min_selections, max_selections)
    VALUES (item.id, 'Options', false, 0, 5)
    RETURNING id INTO new_group_id;

    INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES
      (new_group_id, 'Extra Swiss Cheese', 3.00),
      (new_group_id, 'No Swiss Cheese', 0),
      (new_group_id, 'Extra Corned Beef', 5.00),
      (new_group_id, 'Extra Russian Dressing', 1.00),
      (new_group_id, 'No Russian Dressing', 0);
  END LOOP;
END $$;
