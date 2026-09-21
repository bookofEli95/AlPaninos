-- 25MOB was pinned to a single location's "The Mob" category_id (see the
-- promo_redemption migration, which ran before a second location existed).
-- Categories are duplicated per location (see the second-location
-- migration), so that fixed id only ever matches the original location's
-- copy -- ordering from any other location silently computes a $0 discount
-- even though Deals shows the code as applied (it doesn't check eligibility
-- at apply time). Wheel/points rewards already avoid this by resolving
-- category NAME dynamically against whichever location the cart is
-- currently for (see lib/promoEligibility.ts) -- give 25MOB the same
-- treatment instead of a location-pinned id.
UPDATE public.promotions
SET category_id = NULL, category_name = 'The Mob'
WHERE code = '25MOB';
