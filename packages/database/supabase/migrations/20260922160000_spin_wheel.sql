-- Spin-to-win wheel shown once to a registered user the first time they log
-- in after confirming their email (see app/_layout.tsx's navigation guard).
-- has_spun_wheel gates that -- flipped permanently by claim_wheel_prize()
-- below the moment they spin, so the wheel never shows again for that
-- account. wheel_prize_title/wheel_prize_code just mirror the last prize so
-- the app can still say "you won X" if the result screen never got to show
-- (e.g. the app was closed mid-animation).
ALTER TABLE public.profiles ADD COLUMN has_spun_wheel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN panino_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN wheel_prize_title TEXT;
ALTER TABLE public.profiles ADD COLUMN wheel_prize_code TEXT;

-- Wheel prizes are personal, one-time codes rather than storewide deals, so
-- promotions needs a way to scope a row to a single account.
ALTER TABLE public.promotions ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- A wheel-won "free X" prize is a 100%-off-category code, but nothing should
-- cap what "free" means if the menu grows pricier items into that category
-- later -- max_discount_amount puts a ceiling in dollars.
ALTER TABLE public.promotions ADD COLUMN max_discount_amount NUMERIC(10,2);

-- Categories are duplicated per-location (see the second-location
-- migration), so a single category_id (as the existing 25MOB promo uses)
-- only ever matches one location's copy. A wheel prize is won before the
-- winner has necessarily picked which location they'll order from, so it's
-- stored by category NAME instead and resolved against whichever location
-- the cart is currently for (see cart.tsx / lib/promoEligibility.ts).
-- category_id stays as the resolved-immediately option for staff-authored
-- promotions that don't need this.
ALTER TABLE public.promotions ADD COLUMN category_name TEXT;

-- Narrows eligibility further than category alone (e.g. "Free Fries" should
-- match only the plain "Fries" item, not "Greek Fries" or "Pulled Pork
-- Fries" in the same Sides category).
ALTER TABLE public.promotions ADD COLUMN item_name_patterns TEXT[];

-- A wheel-won code is personal -- only its winner (or staff) should ever see
-- it in a read of the promotions table.
DROP POLICY IF EXISTS "Public read active promotions" ON public.promotions;
CREATE POLICY "Public read active promotions" ON public.promotions
  FOR SELECT USING (is_active = true AND (user_id IS NULL OR user_id = auth.uid()));

-- Picks a weighted-random prize server-side (so the odds can't be read or
-- tampered with from the client), grants it, and permanently marks the
-- account as spun. No user_id parameter -- always acts on auth.uid() so one
-- account can never claim on behalf of another. Idempotent: calling it again
-- after already spinning just replays the same result instead of erroring,
-- so a double-tap or a retried network call can't grant two prizes.
--
-- Segment order/odds here must stay in sync with the wheel's visual segments
-- in apps/mobile/lib/wheelPrizes.ts.
CREATE OR REPLACE FUNCTION public.claim_wheel_prize()
RETURNS jsonb AS $$
DECLARE
  uid UUID := auth.uid();
  is_anon BOOLEAN;
  already_spun BOOLEAN;
  existing_title TEXT;
  existing_code TEXT;
  roll INT;
  prize_index INT;
  prize_title TEXT;
  prize_kind TEXT;
  prize_category_name TEXT;
  prize_discount_percent NUMERIC;
  prize_item_patterns TEXT[];
  prize_max_discount NUMERIC;
  prize_points INT;
  new_code TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_anonymous INTO is_anon FROM auth.users WHERE id = uid;
  IF coalesce(is_anon, true) THEN
    RAISE EXCEPTION 'Guests are not eligible for the welcome wheel';
  END IF;

  SELECT has_spun_wheel, wheel_prize_title, wheel_prize_code
  INTO already_spun, existing_title, existing_code
  FROM public.profiles WHERE id = uid FOR UPDATE;

  IF already_spun THEN
    RETURN jsonb_build_object('already_spun', true, 'title', existing_title, 'code', existing_code);
  END IF;

  roll := floor(random() * 100)::int + 1; -- 1..100

  IF roll <= 10 THEN
    prize_index := 0; prize_title := '25% Off Your Next Order'; prize_kind := 'percent_off';
    prize_category_name := NULL; prize_discount_percent := 25; prize_item_patterns := NULL; prize_max_discount := NULL;
  ELSIF roll <= 60 THEN
    prize_index := 1; prize_title := 'Free Choice of Pop'; prize_kind := 'percent_off';
    prize_category_name := 'Drinks'; prize_discount_percent := 100; prize_item_patterns := NULL; prize_max_discount := 5.00;
  ELSIF roll <= 65 THEN
    prize_index := 2; prize_title := 'Free Mob Sandwich'; prize_kind := 'percent_off';
    prize_category_name := 'The Mob'; prize_discount_percent := 100; prize_item_patterns := NULL; prize_max_discount := 25.00;
  ELSIF roll <= 66 THEN
    prize_index := 3; prize_title := 'GRAND PRIZE: Free Order'; prize_kind := 'percent_off';
    prize_category_name := NULL; prize_discount_percent := 100; prize_item_patterns := NULL; prize_max_discount := 40.00;
  ELSIF roll <= 76 THEN
    prize_index := 4; prize_title := 'Free Specialty Fries'; prize_kind := 'percent_off';
    prize_category_name := 'Sides'; prize_discount_percent := 100;
    prize_item_patterns := ARRAY['Greek Fries', 'Philly Fries', 'Fries N Gravy', 'Pulled Pork Fries'];
    prize_max_discount := 15.00;
  ELSIF roll <= 96 THEN
    prize_index := 5; prize_title := 'Free Fries'; prize_kind := 'percent_off';
    prize_category_name := 'Sides'; prize_discount_percent := 100;
    prize_item_patterns := ARRAY['Fries']; prize_max_discount := 8.00;
  ELSE
    prize_index := 6; prize_title := '1000 PaninoPoints'; prize_kind := 'points'; prize_points := 1000;
  END IF;

  IF prize_kind = 'points' THEN
    new_code := NULL;
    UPDATE public.profiles
    SET has_spun_wheel = true,
        panino_points = panino_points + prize_points,
        wheel_prize_title = prize_title,
        wheel_prize_code = NULL
    WHERE id = uid;
  ELSE
    new_code := 'WHEEL' || upper(substr(md5(uid::text || clock_timestamp()::text), 1, 6));

    INSERT INTO public.promotions (
      user_id, title, description, code, is_active,
      discount_percent, category_name, item_name_patterns, max_discount_amount
    ) VALUES (
      uid, prize_title, 'Won on the welcome wheel.', new_code, true,
      prize_discount_percent, prize_category_name, prize_item_patterns, prize_max_discount
    );

    UPDATE public.profiles
    SET has_spun_wheel = true,
        wheel_prize_title = prize_title,
        wheel_prize_code = new_code
    WHERE id = uid;
  END IF;

  RETURN jsonb_build_object(
    'already_spun', false,
    'index', prize_index,
    'title', prize_title,
    'kind', prize_kind,
    'code', new_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
