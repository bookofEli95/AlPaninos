-- "Popular right now" on the Menu: a store's real best sellers -- units
-- ordered over the last 60 days (cancelled orders don't count), across the
-- whole day. get_daypart_picks() is a different list on purpose (Home's
-- "Lunch Rush" / "Tonight" picks, limited to items tagged for that time of
-- day), so it isn't a fair "popular" list.
--
-- A new store, or a quiet stretch, has little or no sales yet: ties (and
-- items never ordered) fall back to the signature sandwiches -- The Mob,
-- then Al's Wraps -- with a photo first. `sold` comes back with each item
-- so the app can say "Popular right now" only when there's real sales
-- behind it, and "Our signatures" otherwise.
--
-- Nothing unavailable, catering-only, from the app-only Secret Mob, or a
-- drop that hasn't started (or has ended). SECURITY DEFINER because sales
-- come from everyone's orders, which a customer can't read -- only the
-- totals leave the function.

CREATE OR REPLACE FUNCTION public.get_popular_items(p_location_id UUID, p_limit INT DEFAULT 8)
RETURNS TABLE (
  id UUID,
  name TEXT,
  base_price NUMERIC,
  image_url TEXT,
  category_id UUID,
  location_id UUID,
  sold BIGINT
) AS $$
  WITH sales AS (
    SELECT oi.menu_item_id, SUM(oi.quantity)::BIGINT AS sold
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.location_id = p_location_id
      AND o.status <> 'cancelled'
      AND o.created_at > now() - INTERVAL '60 days'
    GROUP BY oi.menu_item_id
  )
  SELECT mi.id, mi.name, mi.base_price, mi.image_url, mi.category_id, mi.location_id, COALESCE(s.sold, 0)
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN sales s ON s.menu_item_id = mi.id
  WHERE mi.location_id = p_location_id
    AND COALESCE(mi.is_available, true)
    AND NOT COALESCE(mi.is_catering, false)
    AND NOT COALESCE(mc.is_catering, false)
    AND NOT COALESCE(mc.is_secret, false)
    AND (mi.drop_starts_at IS NULL OR mi.drop_starts_at <= now())
    AND (mi.drop_ends_at IS NULL OR mi.drop_ends_at > now())
  ORDER BY
    COALESCE(s.sold, 0) DESC,
    (mi.image_url IS NOT NULL) DESC,
    CASE mc.name WHEN 'The Mob' THEN 0 WHEN 'Al''s Wraps' THEN 1 ELSE 2 END,
    mi.name
  LIMIT LEAST(GREATEST(p_limit, 1), 12);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_popular_items(UUID, INT) TO anon, authenticated;
