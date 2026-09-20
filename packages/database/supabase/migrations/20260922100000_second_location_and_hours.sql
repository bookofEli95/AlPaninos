-- Second location. Coordinates left null for now (same as St. Thomas
-- originally) -- "Use My Location" just sorts it to the end until they're
-- set.
INSERT INTO public.locations (name, address, tax_rate)
VALUES ('London - Richmond St', '525 Richmond St, London, ON N6A 3E8', 0.130);

-- Operating hours -- same for both locations for now. Times are 24h local.
ALTER TABLE public.locations ADD COLUMN hours JSONB;

UPDATE public.locations
SET hours = '{
  "sunday":    {"open": "12:00", "close": "18:00"},
  "monday":    {"open": "11:00", "close": "16:00"},
  "tuesday":   {"open": "11:00", "close": "16:00"},
  "wednesday": {"open": "11:00", "close": "18:00"},
  "thursday":  {"open": "11:00", "close": "20:00"},
  "friday":    {"open": "11:00", "close": "22:00"},
  "saturday":  {"open": "12:00", "close": "22:00"}
}'::jsonb;

-- Clone the category structure (name + sort order only) from the existing
-- location onto the new one. scripts/import-menu.cjs matches menu.csv rows
-- to a location by category name, so the new location needs these to exist
-- before re-running it will populate its items and modifiers.
INSERT INTO public.menu_categories (location_id, name, sort_order)
SELECT new_loc.id, src_cat.name, src_cat.sort_order
FROM public.menu_categories src_cat
JOIN public.locations src_loc ON src_loc.id = src_cat.location_id AND src_loc.name = 'St. Thomas Downtown'
CROSS JOIN public.locations new_loc
WHERE new_loc.name = 'London - Richmond St'
AND NOT EXISTS (
  SELECT 1 FROM public.menu_categories existing
  WHERE existing.location_id = new_loc.id AND existing.name = src_cat.name
);
