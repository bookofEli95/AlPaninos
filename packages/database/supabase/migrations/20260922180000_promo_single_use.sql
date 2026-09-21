-- Every coupon/promo is one-time-per-account by default -- a staffer has to
-- explicitly opt a specific promotion out (set single_use = false) for it to
-- be reusable by the same customer more than once. Applies to existing rows
-- too (25MOB included), matching what was asked: single-use unless
-- specified otherwise.
ALTER TABLE public.promotions ADD COLUMN single_use BOOLEAN NOT NULL DEFAULT true;
