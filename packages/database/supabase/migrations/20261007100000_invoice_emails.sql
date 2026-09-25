-- A record of every invoice the email-invoice function sends (see
-- supabase/functions/email-invoice). It's how the function limits sends per
-- order, so the app's Email Invoice button can't be used to flood an inbox
-- from the store's Gmail. Only the function writes here (with the service
-- role); customers can't read or write it, staff can read it.
CREATE TABLE IF NOT EXISTS public.invoice_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sent_to TEXT NOT NULL,
  sent_by UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_emails_order_id_idx ON public.invoice_emails (order_id);

ALTER TABLE public.invoice_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view invoice emails" ON public.invoice_emails;
CREATE POLICY "Staff view invoice emails" ON public.invoice_emails FOR SELECT USING (public.is_staff());
