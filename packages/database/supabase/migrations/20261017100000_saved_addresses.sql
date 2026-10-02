-- Saved addresses: a customer's "Home" and "Work", saved once and picked
-- with one tap wherever a delivery address is chosen (the Pickup/Delivery
-- sheet and the cart). One of each per customer -- saving Home again
-- replaces it.
CREATE TABLE IF NOT EXISTS public.saved_addresses (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('home', 'work')),
  address TEXT NOT NULL CHECK (length(trim(address)) > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, label)
);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own saved addresses" ON public.saved_addresses;
CREATE POLICY "Users see own saved addresses" ON public.saved_addresses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add own saved addresses" ON public.saved_addresses;
CREATE POLICY "Users add own saved addresses" ON public.saved_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users change own saved addresses" ON public.saved_addresses;
CREATE POLICY "Users change own saved addresses" ON public.saved_addresses FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users remove own saved addresses" ON public.saved_addresses;
CREATE POLICY "Users remove own saved addresses" ON public.saved_addresses FOR DELETE USING (auth.uid() = user_id);
