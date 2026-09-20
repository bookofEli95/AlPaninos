-- "Use my location" (index.tsx) needs coordinates to sort by distance --
-- existing locations won't have these until the owner fills them in via
-- Studio (or a future geocoding pass), so the app should treat null
-- lat/lng as "distance unknown" rather than erroring.
ALTER TABLE public.locations ADD COLUMN latitude NUMERIC;
ALTER TABLE public.locations ADD COLUMN longitude NUMERIC;

-- Tax rate lives per-location (not hardcoded in the app) since it varies by
-- province/jurisdiction if AlPaninos ever expands. Ontario HST as the
-- default for the existing seeded location.
ALTER TABLE public.locations ADD COLUMN tax_rate NUMERIC(4,3) NOT NULL DEFAULT 0.130;

-- Cart/checkout now breaks the total into subtotal + tax instead of one
-- lump sum. Nullable since past orders were never priced this way.
ALTER TABLE public.orders ADD COLUMN subtotal_amount NUMERIC(10,2);
ALTER TABLE public.orders ADD COLUMN tax_amount NUMERIC(10,2);

-- Dedicated Deals section (menu/[id].tsx) -- a simple promotional bulletin
-- for now (display only, no code-redemption/discount-at-checkout logic
-- yet). location_id null means it applies to every location.
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active promotions" ON public.promotions FOR SELECT USING (is_active = true);
CREATE POLICY "Staff manage promotions" ON public.promotions USING (public.is_staff());
