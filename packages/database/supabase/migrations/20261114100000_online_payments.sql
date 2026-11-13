-- Online card payments (linked to Clover later) and tips.
--
-- How an order is paid (orders.payment_method):
--   'in_store' -- at pickup, or when it's delivered (as before)
--   'online'   -- by card at checkout, with an optional tip
--   'invoice'  -- catering only: we call to confirm, then send an invoice
--
-- Where the payment is (orders.payment_status):
--   'unpaid'   -- paid at the store / by invoice later
--   'awaiting' -- a card order that hasn't been charged yet
--   'charging' -- the card is being charged right now
--   'paid'     -- charged; amount_paid, paid_at, payment_ref, card_summary
--   'refunded' -- money given back (in Clover)
--
-- A card order is placed first (place_order), then charged by the
-- pay-order Edge Function, which alone can mark it paid
-- (begin_order_payment / finish_order_payment, service role only). Until
-- it's paid nobody sees it -- not the store, not the order lists -- and a
-- declined card removes it again and gives back any reward it used, so the
-- customer can try another card or choose to pay at the store.
-- Each store turns card payments on with locations.online_payments.

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS online_payments BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'in_store',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS card_summary TEXT,
  ADD COLUMN IF NOT EXISTS payment_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spent_codes TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('in_store', 'online', 'invoice'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'awaiting', 'charging', 'paid', 'refunded'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tip_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_tip_check CHECK (tip_amount >= 0);

CREATE INDEX IF NOT EXISTS orders_unpaid_card_idx ON public.orders (created_at)
  WHERE payment_status IN ('awaiting', 'charging');

-- Payment details only change through the functions below (they run as the
-- database owner); never straight from the website or app, staff included.
CREATE OR REPLACE FUNCTION public.protect_payment_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.tip_amount IS DISTINCT FROM OLD.tip_amount
    OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
    OR NEW.card_summary IS DISTINCT FROM OLD.card_summary
    OR NEW.payment_started_at IS DISTINCT FROM OLD.payment_started_at
    OR NEW.spent_codes IS DISTINCT FROM OLD.spent_codes
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  ) THEN
    RAISE EXCEPTION 'Payment details can''t be changed here.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_payment_fields ON public.orders;
CREATE TRIGGER on_order_payment_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_payment_fields();

-- Unpaid card orders stay out of sight (store screen, order lists, order
-- page). One stuck mid-charge for over 2 minutes shows up, so the store
-- can check it in Clover.
DROP POLICY IF EXISTS "Card orders show once paid" ON public.orders;
CREATE POLICY "Card orders show once paid" ON public.orders
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    payment_status <> 'awaiting'
    AND (payment_status <> 'charging' OR payment_started_at < now() - interval '2 minutes')
  );

-- Gives back the codes a removed card order had used.
CREATE OR REPLACE FUNCTION public.restore_order_codes(p_user UUID, p_codes TEXT[])
RETURNS VOID AS $$
  UPDATE public.promotions SET is_active = true
  WHERE user_id = p_user AND lower(code) = ANY(SELECT lower(c) FROM unnest(p_codes) c);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Card orders that were placed but never charged (the page was closed
-- before paying): removed after 15 minutes, their codes given back.
CREATE OR REPLACE FUNCTION public.release_unpaid_orders()
RETURNS INT AS $$
DECLARE
  o RECORD;
  n INT := 0;
BEGIN
  FOR o IN
    SELECT id, user_id, spent_codes FROM public.orders
    WHERE payment_status = 'awaiting' AND created_at < now() - interval '15 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.restore_order_codes(o.user_id, o.spent_codes);
    DELETE FROM public.orders WHERE id = o.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- pay-order, step 1: this customer's card order, claimed for charging (so
-- two taps can never charge it twice). Says what to charge.
CREATE OR REPLACE FUNCTION public.begin_order_payment(p_order_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT id, user_id, location_id, payment_method, payment_status, total_amount, tip_amount, customer_email
  INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.user_id IS DISTINCT FROM p_user_id OR o.payment_method <> 'online' THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  IF o.payment_status = 'paid' THEN
    RETURN jsonb_build_object('state', 'paid');
  END IF;
  IF o.payment_status <> 'awaiting' THEN
    RETURN jsonb_build_object('state', 'busy');
  END IF;
  UPDATE public.orders SET payment_status = 'charging', payment_started_at = now() WHERE id = o.id;
  RETURN jsonb_build_object(
    'state', 'charge',
    'amount', o.total_amount + o.tip_amount,
    'location_id', o.location_id,
    'email', o.customer_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- pay-order, step 2: how the charge went.
--   'approved' -- paid
--   'declined' -- not charged: the order is removed and its codes given
--                 back, so they can try again
--   'unknown'  -- no answer from the card company: left as it is, for the
--                 store to check (it appears on their screen after 2 minutes)
CREATE OR REPLACE FUNCTION public.finish_order_payment(
  p_order_id UUID, p_outcome TEXT, p_amount NUMERIC DEFAULT NULL, p_ref TEXT DEFAULT NULL, p_card TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT id, user_id, spent_codes, payment_status INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.payment_status <> 'charging' THEN
    RETURN jsonb_build_object('state', 'not_charging');
  END IF;
  IF p_outcome = 'approved' THEN
    UPDATE public.orders
    SET payment_status = 'paid', paid_at = now(), amount_paid = p_amount, payment_ref = p_ref, card_summary = p_card
    WHERE id = o.id;
    RETURN jsonb_build_object('state', 'paid');
  ELSIF p_outcome = 'declined' THEN
    PERFORM public.restore_order_codes(o.user_id, o.spent_codes);
    DELETE FROM public.orders WHERE id = o.id;
    RETURN jsonb_build_object('state', 'removed');
  END IF;
  RETURN jsonb_build_object('state', 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the server (pay-order, with the service role key) runs these.
REVOKE ALL ON FUNCTION public.restore_order_codes(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_unpaid_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_order_payment(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_unpaid_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_order_payment(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

-- place_order: as in the catering_menu migration, plus how it's paid and
-- the tip (step 3b), unpaid card orders kept back, and the release of
-- abandoned ones.
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
  v_client_key TEXT := NULLIF(trim(p->>'client_key'), '');
  prior RECORD;
  -- How it's paid (payments migration): 'in_store' (at pickup / when it
  -- arrives), 'online' (by card at checkout) or 'invoice' (catering).
  v_pay_method TEXT := COALESCE(NULLIF(trim(p->>'payment_method'), ''), 'in_store');
  v_tip NUMERIC := COALESCE(NULLIF(p->>'tip_amount', '')::numeric, 0);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in (or continue as a guest) to place an order.';
  END IF;

  -- 0. The same checkout sent again (the phone lost signal after the order
  -- went in, and they tapped Place Order again): hand back the order that
  -- already exists instead of making a second one. The lock makes two
  -- copies arriving at once take turns.
  IF v_client_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(uid::text || ':' || v_client_key));
    SELECT id, subtotal_amount, discount_amount, tax_amount, total_amount, is_catering,
           tip_amount, payment_method, payment_status INTO prior
    FROM public.orders WHERE user_id = uid AND client_key = v_client_key;
    IF prior.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'order_id', prior.id,
        'subtotal', prior.subtotal_amount,
        'discount', prior.discount_amount,
        'tax', prior.tax_amount,
        'total', prior.total_amount,
        'tip', prior.tip_amount,
        'amount_due', prior.total_amount + prior.tip_amount,
        'payment_method', prior.payment_method,
        'payment_status', prior.payment_status,
        'is_catering', prior.is_catering,
        'already_placed', true
      );
    END IF;
  END IF;

  -- Card orders nobody finished paying for (the page was closed mid-way):
  -- gone after 15 minutes, their codes given back.
  PERFORM public.release_unpaid_orders();

  SELECT id, tax_rate, online_payments INTO loc FROM public.locations WHERE id = (p->>'location_id')::uuid;
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

    SELECT mi.id, mi.name, mi.base_price, mi.is_catering, mi.category_id, mi.is_available,
           mi.drop_starts_at, mi.drop_ends_at, mi.per_person, mc.name AS category_name
    INTO item
    FROM public.menu_items mi
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE mi.id = (line->>'menu_item_id')::uuid AND mi.location_id = loc.id;
    IF item.id IS NULL THEN
      RAISE EXCEPTION 'An item in your cart isn''t sold at this store anymore. Please remove it and try again.';
    END IF;
    IF v_qty < 1 OR v_qty > (CASE WHEN item.per_person THEN 1000 ELSE 99 END) THEN
      RAISE EXCEPTION 'Item % has an invalid quantity.', line_no;
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
  END IF;

  -- 3b. How it's paid, and the tip (only with a card payment).
  IF v_pay_method NOT IN ('in_store', 'online', 'invoice') THEN
    RAISE EXCEPTION 'Please choose how you''d like to pay.';
  END IF;
  IF v_pay_method = 'invoice' AND NOT v_is_catering THEN
    RAISE EXCEPTION 'Paying by invoice is for catering orders. Please choose another way to pay.';
  END IF;
  IF v_pay_method = 'online' AND NOT COALESCE(loc.online_payments, false) THEN
    RAISE EXCEPTION 'This store isn''t taking card payments online right now. Please choose to pay at the store.';
  END IF;
  IF v_pay_method <> 'online' THEN
    v_tip := 0;
  END IF;
  IF v_tip < 0 OR v_tip <> round(v_tip, 2) OR v_tip > v_total THEN
    RAISE EXCEPTION 'Please check the tip amount.';
  END IF;
  -- Nothing to pay (a free reward): no card to charge.
  IF v_total + v_tip = 0 THEN
    v_pay_method := 'in_store';
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
    is_catering, catering_company, catering_notes, po_number, invoice_email, client_key,
    payment_method, payment_status, tip_amount, spent_codes
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
    CASE WHEN v_is_catering THEN left(NULLIF(trim(p->>'catering_notes'), ''), 2000) END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'po_number'), '') END,
    CASE WHEN v_is_catering THEN NULLIF(trim(p->>'invoice_email'), '') END,
    v_client_key,
    v_pay_method,
    -- A card order waits, out of sight of the store, until it's paid.
    CASE WHEN v_pay_method = 'online' THEN 'awaiting' ELSE 'unpaid' END,
    v_tip,
    -- The codes spent below, to give back if the card payment fails.
    v_reward_codes || CASE WHEN v_promo_used IS NOT NULL AND v_promo_owner = uid THEN ARRAY[v_promo_used] ELSE '{}'::text[] END
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
    'tip', v_tip,
    'amount_due', v_total + v_tip,
    'payment_method', v_pay_method,
    'payment_status', CASE WHEN v_pay_method = 'online' THEN 'awaiting' ELSE 'unpaid' END,
    'is_catering', v_is_catering
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO authenticated;
