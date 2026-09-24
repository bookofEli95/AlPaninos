-- Lets a modifier group take several of the same option ("2x Fat Tony")
-- with -/+ steppers instead of one checkbox each; min_selections /
-- max_selections then count the total (e.g. exactly 5 paninos). Each unit
-- is stored as its own row in order_item_modifiers, so pricing, reorder and
-- receipts need no other changes.
ALTER TABLE public.modifier_groups ADD COLUMN IF NOT EXISTS allow_quantity BOOLEAN NOT NULL DEFAULT false;

-- The catering boards: pick any mix of 5 (or 10) paninos, repeats allowed.
UPDATE public.modifier_groups g
SET allow_quantity = true
FROM public.menu_items i
WHERE i.id = g.menu_item_id
  AND i.is_catering
  AND g.name IN ('Choose 5 Paninos', 'Choose 10 Paninos');

-- The Drinks Pack: any mix adding up to its 12 cans, instead of "up to 3
-- flavours".
UPDATE public.modifier_groups g
SET allow_quantity = true,
    name = 'Choose Your 12 Cans',
    min_selections = 12,
    max_selections = 12
FROM public.menu_items i
WHERE i.id = g.menu_item_id
  AND i.is_catering
  AND g.name = 'Choose Up To 3 Flavours';

UPDATE public.menu_items
SET description = '12 cold cans for the group -- mix and match any flavours. Order by 6 PM for next-day pickup or delivery.'
WHERE is_catering AND name = 'The Drinks Pack';
