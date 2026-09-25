-- Fan Favourites: the option combinations customers actually order most at
-- a store ("Fat Tony + Extra Cheese + No Onion"), shown in the Secret Mob
-- with one-tap add. Built from real orders, so there's nothing to moderate
-- and nothing to game.
--
-- A combo counts once it's been ordered at least 3 times in the last 90
-- days (cancelled orders don't count). Plain items and an item's own
-- default choices aren't combos, so they're left out, and so is anything
-- no longer on the menu -- an unavailable item, a drop outside its window,
-- or an option that's since been removed.
--
-- SECURITY DEFINER so it can count every customer's orders -- it only ever
-- returns menu items, option names and a count, never anything about who
-- ordered them.
CREATE OR REPLACE FUNCTION public.get_fan_favourites(p_location_id UUID, p_limit INT DEFAULT 8)
RETURNS TABLE (
  menu_item_id UUID,
  name TEXT,
  image_url TEXT,
  option_ids UUID[],
  option_names TEXT[],
  price NUMERIC,
  times_ordered BIGINT
) AS $$
  WITH combos AS (
    SELECT oi.id, oi.menu_item_id, array_agg(m.modifier_option_id ORDER BY m.modifier_option_id) AS option_ids
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.order_item_modifiers m ON m.order_item_id = oi.id
    WHERE o.location_id = p_location_id
      AND o.status <> 'cancelled'
      AND o.created_at > now() - INTERVAL '90 days'
    GROUP BY oi.id, oi.menu_item_id
  ),
  popular AS (
    SELECT c.menu_item_id, c.option_ids, COUNT(*) AS times_ordered
    FROM combos c
    GROUP BY c.menu_item_id, c.option_ids
    HAVING COUNT(*) >= 3
  ),
  -- Each item's own defaults: ordering it "as it comes" isn't a combo.
  defaults AS (
    SELECT g.menu_item_id, array_agg(o.id ORDER BY o.id) AS option_ids
    FROM public.modifier_groups g
    JOIN public.modifier_options o ON o.group_id = g.id
    WHERE o.is_default AND g.parent_option_id IS NULL
    GROUP BY g.menu_item_id
  )
  SELECT
    p.menu_item_id,
    mi.name,
    mi.image_url,
    p.option_ids,
    ARRAY(
      SELECT mo.name
      FROM unnest(p.option_ids) AS chosen(id)
      JOIN public.modifier_options mo ON mo.id = chosen.id
      JOIN public.modifier_groups mg ON mg.id = mo.group_id
      ORDER BY mg.sort_order, mo.sort_order, mo.name
    ),
    mi.base_price + (
      SELECT COALESCE(SUM(mo.price_adjustment), 0)
      FROM unnest(p.option_ids) AS chosen(id)
      JOIN public.modifier_options mo ON mo.id = chosen.id
    ),
    p.times_ordered
  FROM popular p
  JOIN public.menu_items mi ON mi.id = p.menu_item_id
  LEFT JOIN defaults d ON d.menu_item_id = p.menu_item_id
  WHERE mi.location_id = p_location_id
    AND COALESCE(mi.is_available, true)
    AND NOT mi.is_catering
    AND (mi.drop_starts_at IS NULL OR mi.drop_starts_at <= now())
    AND (mi.drop_ends_at IS NULL OR mi.drop_ends_at > now())
    AND (d.option_ids IS NULL OR d.option_ids <> p.option_ids)
    -- Every option still exists and still belongs to this item.
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.option_ids) AS chosen(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.modifier_options mo
        JOIN public.modifier_groups mg ON mg.id = mo.group_id
        WHERE mo.id = chosen.id AND mg.menu_item_id = p.menu_item_id
      )
    )
  ORDER BY p.times_ordered DESC, mi.name
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_fan_favourites(UUID, INT) TO anon, authenticated;
