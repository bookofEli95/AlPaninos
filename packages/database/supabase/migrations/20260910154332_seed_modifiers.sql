DO $$
DECLARE
  classic_id UUID;
  bread_group_id UUID := gen_random_uuid();
  topping_group_id UUID := gen_random_uuid();
BEGIN
  -- Get the ID for "The Classic"
  SELECT id INTO classic_id FROM public.menu_items WHERE name = 'The Classic' LIMIT 1;

  -- Create Modifier Groups
  -- Bread: Must pick exactly 1
  INSERT INTO public.modifier_groups (id, menu_item_id, name, is_required, min_selections, max_selections)
  VALUES (bread_group_id, classic_id, 'Bread Choice', true, 1, 1);
  
  -- Toppings: Optional, pick up to 3
  INSERT INTO public.modifier_groups (id, menu_item_id, name, is_required, min_selections, max_selections)
  VALUES (topping_group_id, classic_id, 'Extra Toppings', false, 0, 3);

  -- Create Options for Bread
  INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES 
  (bread_group_id, 'Ciabatta', 0.00),
  (bread_group_id, 'Focaccia', 1.50),
  (bread_group_id, 'Gluten Free', 2.00);

  -- Create Options for Toppings
  INSERT INTO public.modifier_options (group_id, name, price_adjustment) VALUES 
  (topping_group_id, 'Extra Mozzarella', 1.50),
  (topping_group_id, 'Balsamic Glaze', 0.50),
  (topping_group_id, 'Hot Peppers', 0.75);
END $$;