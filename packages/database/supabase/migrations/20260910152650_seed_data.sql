DO $$
DECLARE
  loc_id UUID := gen_random_uuid();
BEGIN
  -- Insert Location (Using St. Thomas for local flavor)
  INSERT INTO public.locations (id, name, address)
  VALUES (loc_id, 'St. Thomas Downtown', '123 Talbot St, St. Thomas, ON');

  -- Insert Categories, in the order they should display. Real menu items are
  -- loaded separately via `node scripts/import-menu.cjs` against menu.csv,
  -- which matches items to these by category name.
  INSERT INTO public.menu_categories (location_id, name, sort_order)
  VALUES
  (loc_id, 'The Mob', 1),
  (loc_id, 'Al''s Wraps', 2),
  (loc_id, 'Combo', 3),
  (loc_id, 'Sides', 4),
  (loc_id, 'Drinks', 5),
  (loc_id, 'Extras', 6);
END $$;