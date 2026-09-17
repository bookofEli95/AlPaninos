-- Live progress: an estimate computed once at checkout (cart.tsx) that the
-- order tracking screen counts down against, rather than guessing client-side
-- from scratch every time the screen opens.
ALTER TABLE public.orders ADD COLUMN estimated_ready_at TIMESTAMPTZ;

-- Post-order rating, one per order.
CREATE TABLE public.order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.order_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own order ratings" ON public.order_ratings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own order ratings" ON public.order_ratings FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Staff view all order ratings" ON public.order_ratings FOR SELECT USING (public.is_staff());

-- "Your Usual" (index.tsx): the customer's own most-ordered menu item, only
-- surfaced once they've actually ordered it 2+ times. No user_id parameter --
-- it reads auth.uid() directly so a SECURITY DEFINER caller can't pass someone
-- else's id to read their order history.
CREATE OR REPLACE FUNCTION public.get_usual_item()
RETURNS TABLE (
  menu_item_id UUID,
  name TEXT,
  base_price NUMERIC,
  image_url TEXT,
  location_id UUID,
  times_ordered BIGINT
) AS $$
  SELECT oi.menu_item_id, mi.name, mi.base_price, mi.image_url, mi.location_id, COUNT(*)::BIGINT AS times_ordered
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.user_id = auth.uid()
  GROUP BY oi.menu_item_id, mi.name, mi.base_price, mi.image_url, mi.location_id
  HAVING COUNT(*) >= 2
  ORDER BY times_ordered DESC, MAX(o.created_at) DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
