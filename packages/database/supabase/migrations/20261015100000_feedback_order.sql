-- Customer Support's "Which order is this about?": a message can point at
-- one of the customer's own orders, so staff can see exactly which order
-- went wrong (or right). Nullable -- picking one is optional, and general
-- comments have none. If the order is ever deleted the message stays,
-- just without it.
ALTER TABLE public.customer_feedback
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_feedback_order_id_idx ON public.customer_feedback (order_id);

-- Only their own order: the order attached has to belong to whoever is
-- sending the message (the rest of the rule is unchanged).
DROP POLICY IF EXISTS "Users submit feedback" ON public.customer_feedback;
CREATE POLICY "Users submit feedback" ON public.customer_feedback FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      customer_feedback.order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = customer_feedback.order_id AND o.user_id = auth.uid()
      )
    )
  );
