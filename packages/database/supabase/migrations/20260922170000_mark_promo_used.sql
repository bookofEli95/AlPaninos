-- Deactivates a promo code the caller just redeemed at checkout (cart.tsx),
-- so a personal one-time code (e.g. a wheel prize -- see the spin_wheel
-- migration) disappears from Deals/Profile once used instead of being
-- reusable forever. Scoped to user_id = auth.uid() so this can never touch
-- another account's code, and it naturally no-ops for a shared/storewide
-- promo (user_id IS NULL never matches auth.uid()), so it's safe to call
-- unconditionally after any order that applied a code.
CREATE OR REPLACE FUNCTION public.mark_promo_used(p_code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.promotions
  SET is_active = false
  WHERE code = p_code AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
