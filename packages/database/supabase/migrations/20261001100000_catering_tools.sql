-- Catering tools: the headcount planner, company invoices and the box
-- manifest's dietary tags.

-- 1. Headcount planner (apps/mobile/lib/cateringPlanner.ts). What part of
-- the spread a package is: 'main' packages are combined to feed everyone,
-- 'drink' packages cover one drink a head. Anything else (sides, desserts,
-- or NULL) is left for the customer to add. Set this on any new package.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS catering_role TEXT;
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_catering_role_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_catering_role_check
  CHECK (catering_role IS NULL OR catering_role IN ('main', 'drink', 'side', 'dessert'));

UPDATE public.menu_items SET catering_role = 'main'
WHERE is_catering AND name IN ('The Panino Board', 'The Big Panino Board') AND catering_role IS NULL;
UPDATE public.menu_items SET catering_role = 'drink'
WHERE is_catering AND name = 'The Drinks Pack' AND catering_role IS NULL;
UPDATE public.menu_items SET catering_role = 'side'
WHERE is_catering AND name IN ('The Party Fries Tray', 'The Family Salad Bowl') AND catering_role IS NULL;
UPDATE public.menu_items SET catering_role = 'dessert'
WHERE is_catering AND name = 'The Italian Sweets Box' AND catering_role IS NULL;

-- 2. Company invoices. catering_company (the catering migration) already
-- holds the company name; these are the rest of what an expense report
-- needs. Printed on the invoice PDF from the order screen.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS po_number TEXT;
-- Where the invoice should go (e.g. an accounts-payable inbox). The order
-- screen's "Email Invoice" pre-fills it.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_email TEXT;
-- The business's HST registration number, printed on every invoice.
-- Left empty here -- fill it in for each location in Studio.
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS hst_number TEXT;

-- 3. Dietary tags, shown in the catering box manifest and next to each
-- sandwich when building a board. Only positive tags ("contains ..."):
-- an untagged item is NOT a promise it's free of anything, and the app
-- says so. Allowed values: 'nuts', 'pork', 'vegetarian'.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] NOT NULL DEFAULT '{}';

-- A catering option that *is* a menu item (a sandwich on a board, a
-- flavour in the drinks pack) points at it, so it can show that item's
-- tags. Matched by name within the same location.
ALTER TABLE public.modifier_options
  ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL;

UPDATE public.modifier_options o
SET menu_item_id = src.id
FROM public.modifier_groups g
JOIN public.menu_items pkg ON pkg.id = g.menu_item_id
JOIN public.menu_items src ON src.location_id = pkg.location_id AND NOT src.is_catering
WHERE o.group_id = g.id
  AND pkg.is_catering
  AND g.allow_quantity
  AND src.name = o.name
  AND o.menu_item_id IS NULL;

-- Starting tags, taken only from ingredients the menu descriptions spell
-- out. Descriptions that don't list ingredients (e.g. "A Classic Cubano
-- Sandwich") get nothing here -- review every sandwich in Studio before
-- relying on these.
UPDATE public.menu_items
SET dietary_tags = array_append(dietary_tags, 'nuts')
WHERE NOT is_catering
  AND description ~* '(pistachio|pistashio|walnut|almond|hazelnut|pecan|cashew|peanut|pine nut)'
  AND NOT ('nuts' = ANY(dietary_tags));

UPDATE public.menu_items
SET dietary_tags = array_append(dietary_tags, 'pork')
WHERE NOT is_catering
  AND description ~* '(bacon|\mham\M|pepperoni|mortadella|prosciutto|pancetta|salami|capicola|soppressata|pulled pork|porchetta|chorizo)'
  AND NOT ('pork' = ANY(dietary_tags));

UPDATE public.menu_items
SET dietary_tags = array_append(dietary_tags, 'vegetarian')
WHERE NOT is_catering
  AND description ~* '^\s*vegetarian'
  AND NOT ('vegetarian' = ANY(dietary_tags));
