-- Anyone signed in -- a guest included -- could change their own
-- public.users row through the API ("Users can update own record"), role
-- and all, and so make themselves staff: every customer's orders and
-- details, the menu, prices and deals. Nothing in the app or the website
-- updates this table, so the policy goes; and a trigger stops role and
-- loyalty_balance changes from the API whatever policies come later.
-- Roles are set in the Supabase dashboard (Table Editor > users > role),
-- which this doesn't affect.

DROP POLICY IF EXISTS "Users can update own record" ON public.users;

CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.loyalty_balance IS DISTINCT FROM OLD.loyalty_balance) THEN
    RAISE EXCEPTION 'Roles can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS protect_user_role ON public.users;
CREATE TRIGGER protect_user_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_role();
