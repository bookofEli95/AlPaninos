-- CartUpsellTray.tsx matched upsell candidates by hardcoded name arrays
-- (DUNK_IT_PATTERNS, MEAL_PATTERNS, SWEET_FINISH_PATTERNS) -- if a staffer
-- renames "Side Garlic Aioli" to "House Garlic Aioli" in Studio, it just
-- silently stops matching and drops out of the tray with no error anywhere.
-- A real column read directly off the item survives a rename for free.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS upsell_group TEXT;
