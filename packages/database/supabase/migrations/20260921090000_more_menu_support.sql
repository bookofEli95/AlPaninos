-- Settings screen: on/off toggle for push notifications. Lives per-user
-- (not per-device) -- this app doesn't meaningfully support a customer
-- juggling multiple concurrent devices yet, so one flag per user keeps this
-- simple. The send-order-notification Edge Function checks it before
-- sending, so turning it off actually stops notifications rather than just
-- hiding the setting.
ALTER TABLE public.profiles ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT true;

-- Customer Support screen's comment/review form.
CREATE TABLE public.customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users submit feedback" ON public.customer_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own feedback" ON public.customer_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff view all feedback" ON public.customer_feedback FOR SELECT USING (public.is_staff());
