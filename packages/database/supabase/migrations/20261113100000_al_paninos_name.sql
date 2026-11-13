-- The business name as customers see it: "Al Panino's". The birthday
-- treat's message is written by claim_birthday_reward(), so the function is
-- set again here -- unchanged apart from the message.

CREATE OR REPLACE FUNCTION public.claim_birthday_reward()
RETURNS JSONB AS $$
DECLARE
  uid UUID := auth.uid();
  p RECORD;
  v_today DATE := (now() AT TIME ZONE 'America/Toronto')::date;
  v_year INT;
  v_bday DATE;
  v_found DATE;
  v_expires TIMESTAMPTZ;
  v_promo public.promotions;
BEGIN
  IF NOT public.is_registered(uid) THEN
    RETURN jsonb_build_object('granted', false);
  END IF;

  SELECT birth_month, birth_day, birthday_set_at, birthday_rewarded_for INTO p
  FROM public.profiles WHERE id = uid FOR UPDATE;
  IF p.birth_month IS NULL THEN
    RETURN jsonb_build_object('granted', false);
  END IF;

  -- This year's birthday, or last/next year's around New Year's.
  FOR v_year IN EXTRACT(YEAR FROM v_today)::int - 1 .. EXTRACT(YEAR FROM v_today)::int + 1 LOOP
    v_bday := make_date(
      v_year, p.birth_month,
      LEAST(p.birth_day, EXTRACT(DAY FROM (make_date(v_year, p.birth_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int)
    );
    IF v_today BETWEEN v_bday - 3 AND v_bday + 7 THEN
      v_found := v_bday;
    END IF;
  END LOOP;

  IF v_found IS NULL
     OR p.birthday_rewarded_for IS NOT DISTINCT FROM v_found
     -- Saved at least a week before the birthday, so it can't be set to
     -- today on the spot.
     OR p.birthday_set_at > ((v_found - 7)::timestamp AT TIME ZONE 'America/Toronto')
     -- For customers who've ordered with us before.
     OR NOT EXISTS (SELECT 1 FROM public.orders WHERE user_id = uid AND status <> 'cancelled') THEN
    RETURN jsonb_build_object('granted', false);
  END IF;

  -- Good through the end of the 7th day after the birthday (store time).
  v_expires := (v_found + 8)::timestamp AT TIME ZONE 'America/Toronto';

  INSERT INTO public.promotions (
    user_id, title, description, code, is_active,
    discount_percent, category_name, max_discount_amount, single_use, expires_at
  ) VALUES (
    uid,
    'Birthday Treat: Free Mob Sandwich',
    'Happy birthday from Al Panino''s! Any Mob sandwich, on us.',
    public.new_personal_code('BDAY'),
    true, 100, 'The Mob', 25.00, true, v_expires
  )
  RETURNING * INTO v_promo;

  UPDATE public.profiles SET birthday_rewarded_for = v_found WHERE id = uid;

  RETURN jsonb_build_object(
    'granted', true,
    'title', v_promo.title,
    'code', v_promo.code,
    'expires_at', v_promo.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Birthday treats already handed out say it the new way too.
UPDATE public.promotions
SET description = 'Happy birthday from Al Panino''s! Any Mob sandwich, on us.'
WHERE description = 'Happy birthday from Al Paninos! Any Mob sandwich, on us.';
