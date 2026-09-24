-- Time-of-day picks for the home screen: which items suit lunch and which
-- suit evenings/weekends, ranked by what actually sells at that time.
--
-- daypart_tags decides what's eligible ('lunch', 'evening'); edit it in
-- Studio to feature or drop an item. Within that, items sold most at that
-- time of day over the last 90 days come first.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS daypart_tags TEXT[] NOT NULL DEFAULT '{}';

-- Starting point: sandwiches and wraps for lunch; loaded fries, salads and
-- desserts for evenings and weekends.
UPDATE public.menu_items mi
SET daypart_tags = array_append(mi.daypart_tags, 'lunch')
FROM public.menu_categories c
WHERE c.id = mi.category_id
  AND c.name IN ('The Mob', 'Al''s Wraps')
  AND NOT mi.is_catering
  AND NOT ('lunch' = ANY(mi.daypart_tags));

UPDATE public.menu_items mi
SET daypart_tags = array_append(mi.daypart_tags, 'evening')
FROM public.menu_categories c
WHERE c.id = mi.category_id
  AND c.name = 'Sides'
  AND mi.name <> 'Fries'
  AND NOT mi.is_catering
  AND NOT ('evening' = ANY(mi.daypart_tags));

-- SECURITY DEFINER so it can count every customer's orders -- it only ever
-- returns menu items and a sales count, never anything about the orders.
CREATE OR REPLACE FUNCTION public.get_daypart_picks(p_location_id UUID, p_daypart TEXT, p_limit INT DEFAULT 6)
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
      AND o.created_at > now() - INTERVAL '90 days'
      AND CASE
        WHEN p_daypart = 'lunch' THEN EXTRACT(HOUR FROM public.order_local_time(o)) < 15
        ELSE EXTRACT(HOUR FROM public.order_local_time(o)) >= 15
      END
    GROUP BY oi.menu_item_id
  )
  SELECT mi.id, mi.name, mi.base_price, mi.image_url, mi.category_id, mi.location_id, COALESCE(s.sold, 0)
  FROM public.menu_items mi
  LEFT JOIN sales s ON s.menu_item_id = mi.id
  WHERE mi.location_id = p_location_id
    AND COALESCE(mi.is_available, true)
    AND NOT mi.is_catering
    AND p_daypart = ANY(mi.daypart_tags)
  ORDER BY COALESCE(s.sold, 0) DESC, (mi.image_url IS NOT NULL) DESC, mi.name
  LIMIT LEAST(GREATEST(p_limit, 1), 12);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_daypart_picks(UUID, TEXT, INT) TO anon, authenticated;
