-- Spend-based loyalty: $1 spent = 10 PaninoPoints, awarded automatically the
-- moment an order's status flips to 'completed' (not at placement, so a
-- cancelled order never earns points). A trigger rather than client-side
-- logic since order status changes happen from wherever staff update them
-- (Studio today, a staff app later) -- this way accrual is correct
-- regardless of how the status change happens.
--
-- Based on subtotal_amount (post-discount, pre-tax) rather than the taxed
-- total -- tax isn't spend on food, and rewarding it would inconsistently
-- inflate points across locations with different tax rates.
CREATE OR REPLACE FUNCTION public.award_points_on_completion()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET panino_points = panino_points + FLOOR(COALESCE(NEW.subtotal_amount, NEW.total_amount) * 10)::INTEGER
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_order_completed
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_points_on_completion();

-- Redemption tiers reuse the exact same reward shapes as three of the
-- wheel's prizes (see the spin_wheel migration) -- the wheel is a lucky
-- shortcut to the same rewards a customer can otherwise guarantee by
-- spending. Kept low-friction (a beverage at 300 pts = $30 spent) rather
-- than a single high threshold, so the base loyalty system reads as
-- reliably rewarding rather than requiring a bill to redeem anything.
CREATE OR REPLACE FUNCTION public.redeem_points_reward(p_tier TEXT)
RETURNS jsonb AS $$
DECLARE
  uid UUID := auth.uid();
  current_points INT;
  cost INT;
  reward_title TEXT;
  reward_category_name TEXT;
  reward_item_patterns TEXT[];
  reward_max_discount NUMERIC;
  new_code TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tier = 'beverage' THEN
    cost := 300; reward_title := 'Free Beverage';
    reward_category_name := 'Drinks'; reward_item_patterns := NULL; reward_max_discount := 5.00;
  ELSIF p_tier = 'specialty_side' THEN
    cost := 600; reward_title := 'Free Specialty Side';
    reward_category_name := 'Sides';
    reward_item_patterns := ARRAY['Greek Fries', 'Philly Fries', 'Fries N Gravy', 'Pulled Pork Fries'];
    reward_max_discount := 15.00;
  ELSIF p_tier = 'sandwich' THEN
    cost := 1200; reward_title := 'Free Signature Sandwich';
    reward_category_name := 'The Mob'; reward_item_patterns := NULL; reward_max_discount := 25.00;
  ELSE
    RAISE EXCEPTION 'Unknown reward tier: %', p_tier;
  END IF;

  SELECT panino_points INTO current_points FROM public.profiles WHERE id = uid FOR UPDATE;
  IF current_points IS NULL OR current_points < cost THEN
    RAISE EXCEPTION 'Not enough points';
  END IF;

  new_code := 'PTS' || upper(substr(md5(uid::text || clock_timestamp()::text), 1, 6));

  INSERT INTO public.promotions (
    user_id, title, description, code, is_active,
    discount_percent, category_name, item_name_patterns, max_discount_amount
  ) VALUES (
    uid, reward_title, 'Redeemed with PaninoPoints.', new_code, true,
    100, reward_category_name, reward_item_patterns, reward_max_discount
  );

  UPDATE public.profiles SET panino_points = panino_points - cost WHERE id = uid;

  RETURN jsonb_build_object('title', reward_title, 'code', new_code, 'pointsSpent', cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
