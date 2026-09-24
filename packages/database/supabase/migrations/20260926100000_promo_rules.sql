-- Domino's-style deal rules on promotions, on top of the existing
-- discount_percent / category / max_discount_amount / single_use columns.
-- Enforced by evaluatePromo() in apps/mobile/lib/promoEligibility.ts; every
-- rule is optional (NULL = no restriction), so existing promotions behave
-- exactly as before.

-- Flat dollars off ($3, $7), the alternative to discount_percent. Named
-- amount_off rather than discount_amount because orders.discount_amount
-- already means "dollars actually taken off this order" -- a different thing.
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS amount_off NUMERIC(10,2);

-- Cart subtotal required before the deal unlocks ("over $20").
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2);

-- Mix & Match: how many qualifying items (by quantity) the cart needs.
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_item_count INTEGER;

-- Pickup-only / delivery-only deals. The existing order_type enum rather
-- than free text, so a typo like 'carryout' is rejected instead of silently
-- never matching. NULL = both.
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS order_type public.order_type;

-- Scope a deal to several categories by name (e.g. The Mob + Al's Wraps).
-- category_name only ever held one; names rather than ids because
-- categories are duplicated per location (see the second-location
-- migration).
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS category_names TEXT[];

-- A promo is either a percentage or a flat amount -- never both (it'd be
-- ambiguous which applies) and never neither (it'd apply for $0 off).
-- NOT VALID: enforced for every new or edited row, without failing this
-- migration over any older row that doesn't meet it yet.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotions_one_discount_kind') THEN
    ALTER TABLE public.promotions
      ADD CONSTRAINT promotions_one_discount_kind
      CHECK ((discount_percent IS NULL) <> (amount_off IS NULL)) NOT VALID;
  END IF;
END $$;

-- The first three deals. All single-use per account (the default), and
-- storewide (location_id NULL). Each insert is skipped if its code already
-- exists, so re-running this is harmless.
INSERT INTO public.promotions (title, description, code, is_active, amount_off, min_order_amount, order_type, single_use)
SELECT '$3 Off Pickup', '$3 off any pickup order of $20 or more.', 'CARRYOUT3', true, 3.00, 20.00, 'pickup', true
WHERE NOT EXISTS (SELECT 1 FROM public.promotions WHERE lower(code) = 'carryout3');

INSERT INTO public.promotions (title, description, code, is_active, discount_percent, min_item_count, category_names, single_use)
SELECT 'Mix & Match: 20% Off 2+ Paninos', 'Buy any 2 or more Mob sandwiches or wraps and get 20% off them.', 'MOBDUO', true, 20.00, 2, ARRAY['The Mob', 'Al''s Wraps'], true
WHERE NOT EXISTS (SELECT 1 FROM public.promotions WHERE lower(code) = 'mobduo');

INSERT INTO public.promotions (title, description, code, is_active, amount_off, min_order_amount, single_use)
SELECT '$7 Off The Feast', '$7 off any order of $40 or more.', 'FEAST40', true, 7.00, 40.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.promotions WHERE lower(code) = 'feast40');
