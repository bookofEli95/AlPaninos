CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- No direct insert/update/delete policies -- every write goes through
-- register_push_token() below, so a device's token can only ever be
-- reassigned by the account that just proved it owns that session, never
-- edited by an arbitrary authenticated client hitting the table directly.
CREATE POLICY "Users view own push tokens" ON public.push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff view all push tokens" ON public.push_tokens FOR SELECT USING (public.is_staff());

-- The same physical device can carry different accounts over its lifetime
-- (registered user signs out, a guest session starts, etc.), so registering
-- a token here always deletes any prior owner's row for it first -- the
-- device's notifications should always follow whoever is currently signed
-- in on it, not whoever registered it first.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.push_tokens WHERE token = p_token;
  INSERT INTO public.push_tokens (user_id, token) VALUES (auth.uid(), p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fires the send-order-notification Edge Function whenever an order's
-- status actually changes. supabase_functions.http_request is the CLI's
-- built-in webhook helper (the same one Studio's Database Webhooks UI
-- generates) -- it resolves the local Edge Functions server from inside the
-- Postgres container without needing a hardcoded LAN IP, and points at the
-- hosted project's function URL the same way once deployed.
CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION supabase_functions.http_request(
    'http://host.docker.internal:54321/functions/v1/send-order-notification',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000'
  );
