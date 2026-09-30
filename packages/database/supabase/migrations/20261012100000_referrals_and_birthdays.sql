-- Give $5, Get $5 referrals, and a birthday treat.
--
-- Both hand out personal deals the same way the welcome wheel does (a
-- promotions row with user_id set), so Deals, the cart and place_order()
-- already know how to show, apply and spend them.
--
-- REFERRALS
--   * Every account gets a friendly code of its own (ELIAS42) --
--     get_my_referral() makes it the first time it's asked for.
--   * A new customer types a friend's code into the cart's promo box:
--     redeem_referral_code() gives them $5 off an order of $15 or more.
--     Accounts only (not guests -- a guest session can be made over and over),
--     one friend's code per account, never their own, and only before their
--     first order.
--   * When that friend's first order of $15+ is picked up (status
--     'completed', the same moment PaninoPoints are awarded) the friend who
--     shared the code gets $5 off too.
--
-- BIRTHDAYS
--   * A customer saves their birthday once (month and day, no year) with
--     set_my_birthday(). It can't be changed afterwards from the app, so
--     it can't be moved around for extra treats -- staff can in Studio.
--   * claim_birthday_reward() (called when the app opens) gives a free Mob
--     sandwich from 3 days before the birthday; it's good until 7 days after.
--     Once a year, for customers who've ordered with us before and saved
--     their birthday at least 7 days ahead.
--
-- EXPIRING DEALS
--   promotions.expires_at: after it, a deal is hidden from the app and
--   refused by place_order(). NULL = never expires (every deal until now).

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Public read active promotions" ON public.promotions;
CREATE POLICY "Public read active promotions" ON public.promotions
  FOR SELECT USING (
    is_active = true
    AND (user_id IS NULL OR user_id = auth.uid())
    AND (expires_at IS NULL OR expires_at > now())
  );

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_rewarded_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_month SMALLINT CHECK (birth_month BETWEEN 1 AND 12);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_day SMALLINT CHECK (birth_day BETWEEN 1 AND 31);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday_set_at TIMESTAMPTZ;
-- The birthday (that year's date) the last treat was for -- once a year.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday_rewarded_for DATE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (lower(referral_code));

-- The new columns change only through the functions below, like points and
-- the wheel prize (the protect_profile_rewards migration): this is that
-- trigger with them added.
CREATE OR REPLACE FUNCTION public.protect_profile_reward_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_staff() THEN
    IF TG_OP = 'INSERT' THEN
      -- Profiles are created by handle_new_user() on signup; a customer
      -- inserting one of their own must start from the defaults.
      IF COALESCE(NEW.panino_points, 0) <> 0
         OR COALESCE(NEW.has_spun_wheel, false)
         OR NEW.wheel_prize_title IS NOT NULL
         OR NEW.wheel_prize_code IS NOT NULL
         OR NEW.referral_code IS NOT NULL
         OR NEW.referred_by IS NOT NULL
         OR NEW.referral_rewarded_at IS NOT NULL
         OR NEW.birth_month IS NOT NULL
         OR NEW.birth_day IS NOT NULL
         OR NEW.birthday_set_at IS NOT NULL
         OR NEW.birthday_rewarded_for IS NOT NULL THEN
        RAISE EXCEPTION 'Reward fields can only be set by the app''s reward functions';
      END IF;
    ELSIF NEW.panino_points IS DISTINCT FROM OLD.panino_points
       OR NEW.has_spun_wheel IS DISTINCT FROM OLD.has_spun_wheel
       OR NEW.wheel_prize_title IS DISTINCT FROM OLD.wheel_prize_title
       OR NEW.wheel_prize_code IS DISTINCT FROM OLD.wheel_prize_code
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
       OR NEW.referral_rewarded_at IS DISTINCT FROM OLD.referral_rewarded_at
       OR NEW.birth_month IS DISTINCT FROM OLD.birth_month
       OR NEW.birth_day IS DISTINCT FROM OLD.birth_day
       OR NEW.birthday_set_at IS DISTINCT FROM OLD.birthday_set_at
       OR NEW.birthday_rewarded_for IS DISTINCT FROM OLD.birthday_rewarded_for THEN
      RAISE EXCEPTION 'Reward fields can only be changed by the app''s reward functions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- A personal deal's code: a word and six random letters/numbers.
CREATE OR REPLACE FUNCTION public.new_personal_code(prefix TEXT)
RETURNS TEXT AS $$
  SELECT prefix || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$ LANGUAGE sql VOLATILE SET search_path = public;

-- Is this a signed-in account (not a guest)?
CREATE OR REPLACE FUNCTION public.is_registered(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT uid IS NOT NULL AND NOT COALESCE((SELECT is_anonymous FROM auth.users WHERE id = uid), true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- REFERRALS
-- ---------------------------------------------------------------------------

-- The customer's own code (made the first time), and how many friends have
-- used it / ordered with it.
CREATE OR REPLACE FUNCTION public.get_my_referral()
RETURNS JSONB AS $$
DECLARE
  uid UUID := auth.uid();
  v_code TEXT;
  v_name TEXT;
  v_base TEXT;
  v_try TEXT;
  attempt INT := 0;
BEGIN
  IF NOT public.is_registered(uid) THEN
    RAISE EXCEPTION 'Create a free account to get your own code.';
  END IF;

  SELECT referral_code, first_name INTO v_code, v_name FROM public.profiles WHERE id = uid FOR UPDATE;

  IF v_code IS NULL THEN
    -- Their first name (letters only, accents dropped -- Élodie is ELODIE --
    -- up to 6) and two digits: easy to say out loud and to type. ALP if
    -- there's no name to use.
    v_base := upper(left(regexp_replace(
      translate(COALESCE(v_name, ''), 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'),
      '[^A-Za-z]', '', 'g'), 6));
    IF length(v_base) < 2 THEN
      v_base := 'ALP';
    END IF;
    LOOP
      attempt := attempt + 1;
      v_try := v_base || CASE
        WHEN attempt <= 25 THEN (10 + floor(random() * 90))::int::text
        ELSE (1000 + floor(random() * 9000))::int::text
      END;
      -- Never the same as another customer's code or any deal's code.
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(referral_code) = lower(v_try))
            AND NOT EXISTS (SELECT 1 FROM public.promotions WHERE lower(code) = lower(v_try));
    END LOOP;
    v_code := v_try;
    UPDATE public.profiles SET referral_code = v_code WHERE id = uid;
  END IF;

  RETURN jsonb_build_object(
    'code', v_code,
    'friends_joined', (SELECT COUNT(*) FROM public.profiles WHERE referred_by = uid),
    'friends_ordered', (SELECT COUNT(*) FROM public.profiles WHERE referred_by = uid AND referral_rewarded_at IS NOT NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A friend's code, typed into the cart's promo box. Returns the new $5-off
-- deal (a promotions row, as JSON) to apply -- or NULL when it isn't
-- anyone's code, so the cart can say "invalid code" as for any other.
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
  uid UUID := auth.uid();
  v_referrer UUID;
  v_referrer_name TEXT;
  v_my_referrer UUID;
  v_promo public.promotions;
BEGIN
  IF NULLIF(trim(p_code), '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, first_name INTO v_referrer, v_referrer_name
  FROM public.profiles WHERE lower(referral_code) = lower(trim(p_code));
  IF v_referrer IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_registered(uid) THEN
    RAISE EXCEPTION 'Friend codes are for accounts. Create a free account (on the Profile tab), then enter it again for your $5 off.';
  END IF;
  IF v_referrer = uid THEN
    RAISE EXCEPTION 'That''s your own code! Share it with friends -- they get $5 off, and so do you when they order.';
  END IF;

  SELECT referred_by INTO v_my_referrer FROM public.profiles WHERE id = uid FOR UPDATE;
  IF v_my_referrer IS NOT NULL THEN
    -- The same code again: hand back their $5 off if it's still unused.
    IF v_my_referrer = v_referrer THEN
      SELECT * INTO v_promo FROM public.promotions
      WHERE user_id = uid AND code LIKE 'FRIEND%' AND is_active
      ORDER BY created_at DESC LIMIT 1;
      IF v_promo.id IS NOT NULL THEN
        RETURN to_jsonb(v_promo);
      END IF;
    END IF;
    RAISE EXCEPTION 'You''ve already used a friend''s code.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = uid AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Friend codes are for a first order -- and you''ve already ordered with us. Share your own code from the Profile tab instead!';
  END IF;

  INSERT INTO public.promotions (
    user_id, title, description, code, is_active, amount_off, min_order_amount, single_use
  ) VALUES (
    uid,
    '$5 Off Your First Order',
    'A gift from ' || COALESCE(NULLIF(trim(v_referrer_name), ''), 'your friend') || '. $5 off an order of $15 or more.',
    public.new_personal_code('FRIEND'),
    true, 5.00, 15.00, true
  )
  RETURNING * INTO v_promo;

  UPDATE public.profiles SET referred_by = v_referrer WHERE id = uid;

  RETURN to_jsonb(v_promo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The friend's first order of $15 or more is picked up: the customer who
-- shared the code gets their $5 off. Once per friend.
CREATE OR REPLACE FUNCTION public.reward_referrer_on_completion()
RETURNS trigger AS $$
DECLARE
  v_referrer UUID;
  v_rewarded TIMESTAMPTZ;
  v_friend_name TEXT;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.user_id IS NOT NULL
     AND COALESCE(NEW.subtotal_amount, 0) >= 15 THEN
    SELECT referred_by, referral_rewarded_at, first_name INTO v_referrer, v_rewarded, v_friend_name
    FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;

    IF v_referrer IS NOT NULL AND v_rewarded IS NULL THEN
      INSERT INTO public.promotions (
        user_id, title, description, code, is_active, amount_off, min_order_amount, single_use
      ) VALUES (
        v_referrer,
        '$5 Off -- Thanks for Sharing',
        COALESCE(NULLIF(trim(v_friend_name), ''), 'Your friend') || ' ordered with your code. $5 off an order of $15 or more.',
        public.new_personal_code('THANKS'),
        true, 5.00, 15.00, true
      );
      UPDATE public.profiles SET referral_rewarded_at = now() WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_order_completed_referral ON public.orders;
CREATE TRIGGER on_order_completed_referral
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.reward_referrer_on_completion();

-- ---------------------------------------------------------------------------
-- BIRTHDAYS
-- ---------------------------------------------------------------------------

-- Saved once. Feb 29 is fine (it's celebrated on Feb 28 in other years).
CREATE OR REPLACE FUNCTION public.set_my_birthday(p_month INT, p_day INT)
RETURNS VOID AS $$
DECLARE
  uid UUID := auth.uid();
  v_existing SMALLINT;
BEGIN
  IF NOT public.is_registered(uid) THEN
    RAISE EXCEPTION 'Create a free account to add your birthday.';
  END IF;
  IF p_month IS NULL OR p_day IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_day < 1
     OR p_day > EXTRACT(DAY FROM (make_date(2000, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')) THEN
    RAISE EXCEPTION 'Please choose a real date.';
  END IF;

  SELECT birth_month INTO v_existing FROM public.profiles WHERE id = uid FOR UPDATE;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Your birthday is already saved. To change it, please contact us.';
  END IF;

  UPDATE public.profiles
  SET birth_month = p_month, birth_day = p_day, birthday_set_at = now()
  WHERE id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The birthday treat, if it's the customer's birthday time and they don't
-- have this year's yet. Safe to call as often as the app likes.
-- Returns {granted: true, title, code, expires_at} the one time it's
-- given, else {granted: false}.
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
    'Happy birthday from Al Paninos! Any Mob sandwich, on us.',
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

REVOKE ALL ON FUNCTION public.get_my_referral() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_referral_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_birthday(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_birthday_reward() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_referral() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_birthday(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_birthday_reward() TO authenticated;

-- ---------------------------------------------------------------------------
-- place_order(): the one_item_deals version, now refusing expired deals and
-- rewards (the two lookups also check expires_at). Nothing else changed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_order(p JSONB)
RETURNS JSONB AS $$
DECLARE
  uid UUID := auth.uid();
  loc RECORD;
  v_order_type public.order_type;
  v_requested TIMESTAMPTZ;
  line JSONB;
  line_no INT := 0;
  item RECORD;
  grp RECORD;
  opt RECORD;
  reward RECORD;
  v_qty INT;
  v_option_ids UUID[];
  v_unit NUMERIC;
  v_line_total NUMERIC;
  v_reward_code TEXT;
  v_reward_codes TEXT[] := '{}';
  v_is_catering BOOLEAN := false;
  v_lines JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  -- promo
  v_promo_code TEXT := NULLIF(trim(p->>'promo_code'), '');
  promo RECORD;
  -- Copied out of `promo` once it's found: a record that was never
  -- assigned can't be read, even in a branch that isn't taken.
  v_promo_id UUID;
  v_promo_owner UUID;
  v_promo_used TEXT;
  v_scope_ids UUID[];
  v_patterns TEXT[];
  v_paid_subtotal NUMERIC := 0;
  v_eligible_subtotal NUMERIC := 0;
  v_eligible_count INT := 0;
  v_discount NUMERIC := 0;
  v_discounted NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_expected NUMERIC;
  v_local_now TIMESTAMP;
  v_earliest TIMESTAMP;
  v_order_id UUID;
  v_item_id UUID;
  v_count INT;
  v_min INT;
  v_quantity_mode BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in (or continue as a guest) to place an order.';
  END IF;

  SELECT id, tax_rate INTO loc FROM public.locations WHERE id = (p->>'location_id')::uuid;
  IF loc.id IS NULL THEN
    RAISE EXCEPTION 'That store could not be found.';
  END IF;

  v_order_type := COALESCE(NULLIF(p->>'order_type', ''), 'pickup')::public.order_type;
  IF v_order_type = 'delivery' AND NULLIF(trim(p->>'delivery_address'), '') IS NULL THEN
    RAISE EXCEPTION 'Please add a delivery address.';
  END IF;
  v_requested := NULLIF(p->>'requested_ready_at', '')::timestamptz;

  IF jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'items') = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  -- 1. Price every line from the menu.
  FOR line IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    line_no := line_no + 1;
    v_qty := COALESCE((line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Item % has an invalid quantity.', line_no;
    END IF;

    SELECT mi.id, mi.name, mi.base_price, mi.is_catering, mi.category_id, mi.is_available,
           mi.drop_starts_at, mi.drop_ends_at, mc.name AS category_name
    INTO item
    FROM public.menu_items mi
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE mi.id = (line->>'menu_item_id')::uuid AND mi.location_id = loc.id;
    IF item.id IS NULL THEN
      RAISE EXCEPTION 'An item in your cart isn''t sold at this store anymore. Please remove it and try again.';
    END IF;
    IF NOT COALESCE(item.is_available, true) THEN
      RAISE EXCEPTION '% isn''t available right now. Please remove it and try again.', item.name;
    END IF;
    IF item.drop_starts_at IS NOT NULL AND now() < item.drop_starts_at THEN
      RAISE EXCEPTION '% hasn''t dropped yet.', item.name;
    END IF;
    IF item.drop_ends_at IS NOT NULL AND now() >= item.drop_ends_at THEN
      RAISE EXCEPTION 'The % drop has ended. Please remove it and try again.', item.name;
    END IF;
    v_is_catering := v_is_catering OR COALESCE(item.is_catering, false);

    SELECT COALESCE(array_agg(value::uuid), '{}') INTO v_option_ids
    FROM jsonb_array_elements_text(COALESCE(line->'option_ids', '[]'::jsonb));

    -- Every chosen option must belong to one of this item's option groups.
    IF EXISTS (
      SELECT 1 FROM unnest(v_option_ids) AS chosen(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.modifier_options o
        JOIN public.modifier_groups g ON g.id = o.group_id
        WHERE o.id = chosen.id AND g.menu_item_id = item.id
      )
    ) THEN
      RAISE EXCEPTION 'An option on % isn''t available anymore. Please remove it and add it again.', item.name;
    END IF;

    -- Each group that applies (top-level, or opened by a chosen option):
    -- enough picks, not too many, and repeats only where the app offers
    -- -/+ steppers (see item/[id].tsx).
    FOR grp IN
      SELECT g.* FROM public.modifier_groups g
      WHERE g.menu_item_id = item.id
        AND (g.parent_option_id IS NULL OR g.parent_option_id = ANY(v_option_ids))
    LOOP
      SELECT COUNT(*) INTO v_count
      FROM unnest(v_option_ids) AS chosen(id)
      JOIN public.modifier_options o ON o.id = chosen.id
      WHERE o.group_id = grp.id;

      v_min := COALESCE(NULLIF(grp.min_selections, 0), CASE WHEN grp.is_required THEN 1 ELSE 0 END);
      IF v_count < v_min THEN
        RAISE EXCEPTION 'Please choose % for %.', grp.name, item.name;
      END IF;
      IF COALESCE(grp.max_selections, 0) > 0 AND v_count > grp.max_selections THEN
        RAISE EXCEPTION 'Too many choices for % on %.', grp.name, item.name;
      END IF;

      v_quantity_mode := COALESCE(grp.allow_quantity, false)
        OR (COALESCE(item.is_catering, false) AND COALESCE(grp.max_selections, 0) > 1);
      IF NOT v_quantity_mode AND EXISTS (
        SELECT 1 FROM unnest(v_option_ids) AS chosen(id)
        JOIN public.modifier_options o ON o.id = chosen.id
        WHERE o.group_id = grp.id
        GROUP BY chosen.id HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'An option on % was picked twice.', item.name;
      END IF;
    END LOOP;

    SELECT item.base_price + COALESCE(SUM(o.price_adjustment), 0) INTO v_unit
    FROM unnest(v_option_ids) AS chosen(id)
    JOIN public.modifier_options o ON o.id = chosen.id;

    -- A reward line: free, but only with this customer's own unused
    -- pick-an-item prize code that fits this item.
    v_reward_code := NULLIF(trim(line->>'reward_code'), '');
    IF v_reward_code IS NOT NULL THEN
      IF v_qty <> 1 THEN
        RAISE EXCEPTION 'A free reward item can only be added once.';
      END IF;
      IF lower(v_reward_code) = ANY(SELECT lower(c) FROM unnest(v_reward_codes) c) THEN
        RAISE EXCEPTION 'That reward was already used on another item.';
      END IF;
      SELECT * INTO reward FROM public.promotions
      WHERE lower(code) = lower(v_reward_code) AND user_id = uid AND is_active
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1;
      IF reward.id IS NULL
         OR COALESCE(reward.discount_percent, 0) <> 100
         OR reward.category_name IS NULL
         OR lower(trim(item.category_name)) <> lower(trim(reward.category_name))
         OR (COALESCE(cardinality(reward.item_name_patterns), 0) > 0
             AND NOT lower(trim(item.name)) = ANY(SELECT lower(trim(x)) FROM unnest(reward.item_name_patterns) x))
      THEN
        RAISE EXCEPTION 'The reward on % can''t be used (it may have been used already).', item.name;
      END IF;
      v_reward_codes := v_reward_codes || reward.code;
      v_line_total := 0;
    ELSE
      v_line_total := v_unit * v_qty;
      v_paid_subtotal := v_paid_subtotal + v_line_total;
    END IF;

    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', item.id,
      'category_id', item.category_id,
      'name', item.name,
      'base_price', item.base_price,
      'quantity', v_qty,
      'total', v_line_total,
      'reward_code', v_reward_code,
      'special_instructions', NULLIF(trim(line->>'special_instructions'), ''),
      'option_ids', to_jsonb(v_option_ids)
    );
  END LOOP;

  -- 2. The applied promo -- same rules as evaluatePromo() in the app. A
  -- code whose rules aren't met takes $0 off and isn't recorded or spent.
  IF v_promo_code IS NOT NULL THEN
    SELECT * INTO promo FROM public.promotions
    WHERE lower(code) = lower(v_promo_code)
      AND is_active
      AND (expires_at IS NULL OR expires_at > now())
      AND (user_id IS NULL OR user_id = uid)
      AND (location_id IS NULL OR location_id = loc.id)
    LIMIT 1;
    IF promo.id IS NULL THEN
      RAISE EXCEPTION 'The promo code % isn''t valid anymore. Remove it and try again.', v_promo_code;
    END IF;
    v_promo_id := promo.id;
    v_promo_owner := promo.user_id;
    IF COALESCE(promo.single_use, true) AND EXISTS (
      SELECT 1 FROM public.orders WHERE user_id = uid AND lower(promo_code) = lower(promo.code)
    ) THEN
      RAISE EXCEPTION 'You''ve already used the code %.', promo.code;
    END IF;

    IF promo.order_type IS NULL OR promo.order_type = v_order_type THEN
      -- Category scope at this store (categories are per store).
      IF promo.category_id IS NOT NULL THEN
        v_scope_ids := ARRAY[promo.category_id];
      ELSIF promo.category_name IS NOT NULL OR COALESCE(cardinality(promo.category_names), 0) > 0 THEN
        SELECT COALESCE(array_agg(c.id), '{}') INTO v_scope_ids
        FROM public.menu_categories c
        WHERE c.location_id = loc.id
          AND lower(trim(c.name)) IN (
            SELECT lower(trim(n)) FROM unnest(COALESCE(promo.category_names, '{}') || promo.category_name) n
            WHERE n IS NOT NULL
          );
      ELSE
        v_scope_ids := NULL;
      END IF;
      SELECT COALESCE(array_agg(lower(trim(x))), '{}') INTO v_patterns
      FROM unnest(COALESCE(promo.item_name_patterns, '{}')) x;

      SELECT COALESCE(SUM((l->>'total')::numeric), 0), COALESCE(SUM((l->>'quantity')::int), 0)
      INTO v_eligible_subtotal, v_eligible_count
      FROM jsonb_array_elements(v_lines) l
      WHERE l->>'reward_code' IS NULL
        AND (v_scope_ids IS NULL OR (l->>'category_id')::uuid = ANY(v_scope_ids))
        AND (cardinality(v_patterns) = 0 OR lower(trim(l->>'name')) = ANY(v_patterns));

      -- "One sandwich only": the deal covers just the cheapest
      -- max_discounted_items qualifying items (each unit priced with its
      -- options), however many are in the cart.
      IF promo.max_discounted_items IS NOT NULL THEN
        SELECT COALESCE(SUM(u.unit_price), 0) INTO v_eligible_subtotal
        FROM (
          SELECT (l->>'total')::numeric / (l->>'quantity')::int AS unit_price
          FROM jsonb_array_elements(v_lines) l
          CROSS JOIN LATERAL generate_series(1, (l->>'quantity')::int)
          WHERE l->>'reward_code' IS NULL
            AND (l->>'quantity')::int > 0
            AND (v_scope_ids IS NULL OR (l->>'category_id')::uuid = ANY(v_scope_ids))
            AND (cardinality(v_patterns) = 0 OR lower(trim(l->>'name')) = ANY(v_patterns))
          ORDER BY 1
          LIMIT GREATEST(promo.max_discounted_items, 0)
        ) u;
      END IF;

      IF (promo.min_item_count IS NULL OR v_eligible_count >= promo.min_item_count)
         AND (promo.min_order_amount IS NULL OR v_paid_subtotal >= promo.min_order_amount)
         AND v_eligible_subtotal > 0 THEN
        v_discount := CASE
          WHEN promo.amount_off IS NOT NULL THEN LEAST(promo.amount_off, v_eligible_subtotal)
          ELSE v_eligible_subtotal * COALESCE(promo.discount_percent, 0) / 100
        END;
        IF promo.max_discount_amount IS NOT NULL THEN
          v_discount := LEAST(v_discount, promo.max_discount_amount);
        END IF;
        v_discount := round(LEAST(v_discount, v_paid_subtotal), 2);
        IF v_discount > 0 THEN
          v_promo_used := promo.code;
        END IF;
      END IF;
    END IF;
  END IF;

  v_discounted := GREATEST(0, v_subtotal - v_discount);
  v_tax := round(v_discounted * loc.tax_rate, 2);
  v_total := v_discounted + v_tax;

  -- 3. Catering rules.
  IF v_is_catering THEN
    IF v_requested IS NULL THEN
      RAISE EXCEPTION 'Please choose a date and time for your catering order.';
    END IF;
    v_local_now := now() AT TIME ZONE 'America/Toronto';
    v_earliest := date_trunc('day', v_local_now)
      + make_interval(days => CASE WHEN EXTRACT(HOUR FROM v_local_now) < 18 THEN 1 ELSE 2 END);
    IF (v_requested AT TIME ZONE 'America/Toronto') < v_earliest THEN
      RAISE EXCEPTION 'Catering needs to be ordered by 6 PM the day before. Please choose another date or time.';
    END IF;
    IF v_discounted < 100 THEN
      RAISE EXCEPTION 'Catering orders have a $100 minimum after discounts.';
    END IF;
  END IF;

  -- 4. The total the customer saw has to match.
  v_expected := NULLIF(p->>'expected_total', '')::numeric;
  IF v_expected IS NOT NULL AND abs(v_expected - v_total) > 0.01 THEN
    RAISE EXCEPTION 'PRICE_CHANGED' USING DETAIL = v_total::text;
  END IF;

  -- 5. Save it all.
  INSERT INTO public.orders (
    location_id, user_id, customer_name, customer_phone, customer_email,
    notify_email, notify_sms, subtotal_amount, discount_amount, tax_amount, total_amount,
    promo_code, requested_ready_at, estimated_ready_at, status, order_type, delivery_address,
    is_catering, catering_company, catering_notes, po_number, invoice_email
  ) VALUES (
    loc.id, uid, NULLIF(trim(p->>'customer_name'), ''), NULLIF(trim(p->>'customer_phone'), ''),
    NULLIF(trim(p->>'customer_email'), ''),
    COALESCE((p->>'notify_email')::boolean, true), COALESCE((p->>'notify_sms')::boolean, false),
    v_subtotal, v_discount, v_tax, v_total,
    COALESCE(v_promo_used, v_reward_codes[1]),
    v_requested, NULLIF(p->>'estimated_ready_at', '')::timestamptz, 'received', v_order_type,
    CASE WHEN v_order_type = 'delivery' THEN NULLIF(trim(p->>'delivery_address'), '') END,
    v_is_catering,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'catering_company'), '') END,
    CASE WHEN v_is_catering AND v_order_type = 'delivery' THEN NULLIF(trim(p->>'catering_notes'), '') END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'po_number'), '') END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'invoice_email'), '') END
  )
  RETURNING id INTO v_order_id;

  FOR line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, total_price, special_instructions)
    VALUES (
      v_order_id, (line->>'menu_item_id')::uuid, (line->>'quantity')::int,
      (line->>'base_price')::numeric, (line->>'total')::numeric, line->>'special_instructions'
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.order_item_modifiers (order_item_id, modifier_option_id, price_adjustment)
    SELECT v_item_id, o.id, o.price_adjustment
    FROM jsonb_array_elements_text(line->'option_ids') AS chosen(id)
    JOIN public.modifier_options o ON o.id = chosen.id::uuid;
  END LOOP;

  -- 6. Spend the codes: this customer's own promo (if it took money off)
  -- and every reward used.
  IF v_promo_used IS NOT NULL AND v_promo_owner = uid THEN
    UPDATE public.promotions SET is_active = false WHERE id = v_promo_id;
  END IF;
  UPDATE public.promotions SET is_active = false
  WHERE user_id = uid AND lower(code) = ANY(SELECT lower(c) FROM unnest(v_reward_codes) c);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'total', v_total,
    'is_catering', v_is_catering
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO authenticated;
