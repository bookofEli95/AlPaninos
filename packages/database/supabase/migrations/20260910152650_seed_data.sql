DO $$
DECLARE
  loc_id UUID := gen_random_uuid();
  cat1_id UUID := gen_random_uuid();
  cat2_id UUID := gen_random_uuid();
BEGIN
  -- Insert Location (Using St. Thomas for local flavor)
  INSERT INTO public.locations (id, name, address) 
  VALUES (loc_id, 'St. Thomas Downtown', '123 Talbot St, St. Thomas, ON');

  -- Insert Categories
  INSERT INTO public.menu_categories (id, location_id, name, sort_order) 
  VALUES (cat1_id, loc_id, 'Paninos', 1), (cat2_id, loc_id, 'Drinks', 2);

  -- Insert Items
  INSERT INTO public.menu_items (location_id, category_id, name, description, base_price) 
  VALUES 
  (loc_id, cat1_id, 'The Classic', 'Prosciutto, fresh mozzarella, arugula, balsamic', 12.50),
  (loc_id, cat1_id, 'Spicy Turkey', 'Turkey, provolone, spicy mayo', 11.00),
  (loc_id, cat2_id, 'Espresso', 'Double shot of dark roast', 3.50);
END $$;