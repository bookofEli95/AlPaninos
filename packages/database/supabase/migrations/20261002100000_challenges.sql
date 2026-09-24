-- Challenges: bonus PaninoPoints for ordering on the days (or as often as)
-- the store wants, on top of the usual 10 points per $1.
--
-- Awarded by the database when staff mark an order completed -- never by
-- the app -- the same way award_points_on_completion() works, so a customer
-- can't award themselves points (see protect_profile_reward_columns).
--
-- Two kinds, edited in Studio:
--   'weekdays'    -- order on each of `weekdays` within one week (Mon-Sun).
--                    0 = Sunday ... 6 = Saturday.
--   'order_count' -- order on `target_count` different days in the period.
-- An order counts once it's completed and its subtotal after discounts is at
-- least min_subtotal (so a single can doesn't count as a visit). Days are the
-- pickup/delivery day in store time (Ontario).

CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('weekdays', 'order_count')),
  period TEXT NOT NULL CHECK (period IN ('week', 'month')),
  weekdays INT[],
  target_count INT,
  min_subtotal NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  bonus_points INT NOT NULL CHECK (bonus_points > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'weekdays' AND period = 'week' AND cardinality(weekdays) > 0
      AND weekdays <@ ARRAY[0,1,2,3,4,5,6])
    OR (kind = 'order_count' AND target_count > 0)
  )
);

-- One bonus per customer, per challenge, per week/month.
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  points_awarded INT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, period_start)
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active challenges" ON public.challenges;
CREATE POLICY "Anyone can view active challenges" ON public.challenges
  FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "Staff manage challenges" ON public.challenges;
CREATE POLICY "Staff manage challenges" ON public.challenges
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Read-only for customers; rows are only written by the trigger below.
DROP POLICY IF EXISTS "Users view own challenge completions" ON public.challenge_completions;
CREATE POLICY "Users view own challenge completions" ON public.challenge_completions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Staff manage challenge completions" ON public.challenge_completions;
CREATE POLICY "Staff manage challenge completions" ON public.challenge_completions
  USING (public.is_staff()) WITH CHECK (public.is_staff());

GRANT SELECT ON public.challenges TO anon, authenticated;
GRANT SELECT ON public.challenge_completions TO authenticated;

-- An order's day in store time: when it's picked up / delivered.
CREATE OR REPLACE FUNCTION public.order_local_time(o public.orders)
RETURNS TIMESTAMP AS $$
  SELECT (COALESCE(o.requested_ready_at, o.created_at) AT TIME ZONE 'America/Toronto');
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.challenge_period_start(p_period TEXT, p_local TIMESTAMP)
RETURNS DATE AS $$
  SELECT date_trunc(CASE WHEN p_period = 'week' THEN 'week' ELSE 'month' END, p_local)::date;
$$ LANGUAGE sql IMMUTABLE;

-- A customer's progress on one challenge in the period starting
-- p_period_start. Deliberately not SECURITY DEFINER: called by a customer
-- (through get_my_challenges) it only ever sees their own orders.
CREATE OR REPLACE FUNCTION public.challenge_progress(p_challenge public.challenges, p_user UUID, p_period_start DATE)
RETURNS TABLE (progress INT, target INT, done_days INT[]) AS $$
  WITH qualifying AS (
    SELECT public.order_local_time(o) AS local_time
    FROM public.orders o
    WHERE o.user_id = p_user
      AND o.status = 'completed'
      AND COALESCE(o.subtotal_amount, o.total_amount) - COALESCE(o.discount_amount, 0) >= p_challenge.min_subtotal
  ),
  in_period AS (
    SELECT local_time FROM qualifying
    WHERE public.challenge_period_start(p_challenge.period, local_time) = p_period_start
  )
  SELECT
    CASE WHEN p_challenge.kind = 'weekdays'
      THEN (SELECT COUNT(DISTINCT EXTRACT(DOW FROM local_time))::INT FROM in_period
            WHERE EXTRACT(DOW FROM local_time)::INT = ANY(p_challenge.weekdays))
      ELSE (SELECT COUNT(DISTINCT local_time::date)::INT FROM in_period)
    END,
    CASE WHEN p_challenge.kind = 'weekdays' THEN cardinality(p_challenge.weekdays) ELSE p_challenge.target_count END,
    CASE WHEN p_challenge.kind = 'weekdays'
      THEN COALESCE((SELECT array_agg(DISTINCT EXTRACT(DOW FROM local_time)::INT) FROM in_period
                     WHERE EXTRACT(DOW FROM local_time)::INT = ANY(p_challenge.weekdays)), '{}')
      ELSE '{}'::INT[]
    END;
$$ LANGUAGE sql STABLE SET search_path = public;

-- When an order is completed: any challenge it just finished pays out once.
CREATE OR REPLACE FUNCTION public.award_challenges_on_completion()
RETURNS trigger AS $$
DECLARE
  ch public.challenges;
  p_start DATE;
  prog RECORD;
  inserted_id UUID;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM 'completed' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR ch IN SELECT * FROM public.challenges WHERE is_active LOOP
    p_start := public.challenge_period_start(ch.period, public.order_local_time(NEW));
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.challenge_completions
      WHERE user_id = NEW.user_id AND challenge_id = ch.id AND period_start = p_start
    );

    SELECT * INTO prog FROM public.challenge_progress(ch, NEW.user_id, p_start);
    CONTINUE WHEN prog.progress < prog.target;

    inserted_id := NULL;
    INSERT INTO public.challenge_completions (user_id, challenge_id, period_start, order_id, points_awarded)
    VALUES (NEW.user_id, ch.id, p_start, NEW.id, ch.bonus_points)
    ON CONFLICT (user_id, challenge_id, period_start) DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN
      UPDATE public.profiles SET panino_points = panino_points + ch.bonus_points WHERE id = NEW.user_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_order_completed_challenges ON public.orders;
CREATE TRIGGER on_order_completed_challenges
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_challenges_on_completion();

-- The signed-in customer's challenges for the current week/month (Deals).
CREATE OR REPLACE FUNCTION public.get_my_challenges()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  kind TEXT,
  period TEXT,
  weekdays INT[],
  bonus_points INT,
  min_subtotal NUMERIC,
  progress INT,
  target INT,
  done_days INT[],
  completed BOOLEAN,
  period_end DATE
) AS $$
  SELECT
    c.id, c.title, c.description, c.kind, c.period, c.weekdays, c.bonus_points, c.min_subtotal,
    LEAST(p.progress, p.target), p.target, p.done_days,
    EXISTS (
      SELECT 1 FROM public.challenge_completions cc
      WHERE cc.user_id = auth.uid() AND cc.challenge_id = c.id AND cc.period_start = s.period_start
    ),
    CASE WHEN c.period = 'week' THEN s.period_start + 6 ELSE (s.period_start + INTERVAL '1 month')::date - 1 END
  FROM public.challenges c
  CROSS JOIN LATERAL (
    SELECT public.challenge_period_start(c.period, (now() AT TIME ZONE 'America/Toronto')) AS period_start
  ) s
  CROSS JOIN LATERAL public.challenge_progress(c, auth.uid(), s.period_start) p
  WHERE c.is_active
  ORDER BY c.sort_order, c.created_at;
$$ LANGUAGE sql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_challenges() TO anon, authenticated;

-- Starter challenges -- change the days, counts and points in Studio.
INSERT INTO public.challenges (title, description, kind, period, weekdays, target_count, bonus_points, sort_order)
SELECT 'Midweek Lunch', 'Order on a Tuesday and a Wednesday this week.', 'weekdays', 'week', ARRAY[2,3], NULL, 300, 1
WHERE NOT EXISTS (SELECT 1 FROM public.challenges WHERE title = 'Midweek Lunch');

INSERT INTO public.challenges (title, description, kind, period, weekdays, target_count, bonus_points, sort_order)
SELECT 'Monthly Regular', 'Order on 4 different days this month.', 'order_count', 'month', NULL, 4, 600, 2
WHERE NOT EXISTS (SELECT 1 FROM public.challenges WHERE title = 'Monthly Regular');
