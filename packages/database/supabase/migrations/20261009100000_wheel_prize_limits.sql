-- Welcome wheel prize limits:
--   * GRAND PRIZE: a free order up to $150 (was $40), now titled
--     "GRAND PRIZE: $150 Free Order";
--   * Free Mob Sandwich and Free Specialty Fries: no cap (were $25 / $15).
-- The odds and everything else in claim_wheel_prize() are unchanged (this
-- is the spin_wheel migration's function with just those values edited).
-- Only prizes won from now on get the new limits; ones already won keep
-- theirs.

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
    prize_category_name := 'The Mob'; prize_discount_percent := 100; prize_item_patterns := NULL; prize_max_discount := NULL;
  ELSIF roll <= 66 THEN
    prize_index := 3; prize_title := 'GRAND PRIZE: $150 Free Order'; prize_kind := 'percent_off';
    prize_category_name := NULL; prize_discount_percent := 100; prize_item_patterns := NULL; prize_max_discount := 150.00;
  ELSIF roll <= 76 THEN
    prize_index := 4; prize_title := 'Free Specialty Fries'; prize_kind := 'percent_off';
    prize_category_name := 'Sides'; prize_discount_percent := 100;
    prize_item_patterns := ARRAY['Greek Fries', 'Philly Fries', 'Fries N Gravy', 'Pulled Pork Fries'];
    prize_max_discount := NULL;
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
