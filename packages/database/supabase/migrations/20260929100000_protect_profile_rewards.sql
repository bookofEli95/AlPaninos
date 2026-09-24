-- "Users can update own profile" (see the profiles migration) has no column
-- restriction, so any signed-in customer could call the API directly and set
-- their own panino_points, or flip has_spun_wheel back to false and spin the
-- welcome wheel again for another prize.
--
-- These columns are only ever meant to change through the app's own
-- database functions -- claim_wheel_prize(), redeem_points_reward() and the
-- award_points_on_completion() trigger -- which are all SECURITY DEFINER and
-- so run as their owner, not as the customer. This trigger (deliberately NOT
-- security definer, so current_user is whoever is really making the change)
-- blocks the change when it comes straight from a customer session. Staff
-- editing in Studio, and staff accounts, are unaffected.
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
         OR NEW.wheel_prize_code IS NOT NULL THEN
        RAISE EXCEPTION 'Reward fields can only be set by the app''s reward functions';
      END IF;
    ELSIF NEW.panino_points IS DISTINCT FROM OLD.panino_points
       OR NEW.has_spun_wheel IS DISTINCT FROM OLD.has_spun_wheel
       OR NEW.wheel_prize_title IS DISTINCT FROM OLD.wheel_prize_title
       OR NEW.wheel_prize_code IS DISTINCT FROM OLD.wheel_prize_code THEN
      RAISE EXCEPTION 'Reward fields can only be changed by the app''s reward functions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_reward_columns ON public.profiles;
CREATE TRIGGER protect_profile_reward_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_reward_columns();
