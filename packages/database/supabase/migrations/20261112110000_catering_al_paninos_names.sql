-- "Al's" in the catering menu reads "Al Panino's": the packages (Al Panino's
-- Classic Luncheon, Taco Bar, Texas Feast), their descriptions, and their
-- choices (Al Panino's seasonal salad, Famous Hot Potato Salad, seasonal
-- dessert). Dish names that play on "Al" (Big Al, Pasta Alla Al, Al
-- Panopolous) and the Al's Wraps category -- which deals and the app look
-- up by name -- stay as they are.
UPDATE public.menu_items
SET name = replace(name, 'Al''s ', 'Al Panino''s '),
    description = replace(description, 'Al''s ', 'Al Panino''s ')
WHERE is_catering
  AND per_person
  AND (name LIKE '%Al''s %' OR description LIKE '%Al''s %');

UPDATE public.modifier_options o
SET name = replace(o.name, 'Al''s ', 'Al Panino''s ')
FROM public.modifier_groups g
JOIN public.menu_items mi ON mi.id = g.menu_item_id
WHERE o.group_id = g.id
  AND mi.is_catering
  AND mi.per_person
  AND o.name LIKE '%Al''s %';
