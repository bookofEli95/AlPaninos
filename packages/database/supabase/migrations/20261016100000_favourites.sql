-- Favourites: the heart on a menu item, and the "Your Favourites" row at the
-- top of the menu. One row per item a customer has hearted. The app matches
-- favourites by item name too, so a favourite follows the customer to
-- another store's menu (each store has its own copy of each item).
CREATE TABLE IF NOT EXISTS public.favourite_items (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_item_id)
);

ALTER TABLE public.favourite_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own favourites" ON public.favourite_items;
CREATE POLICY "Users see own favourites" ON public.favourite_items FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add own favourites" ON public.favourite_items;
CREATE POLICY "Users add own favourites" ON public.favourite_items FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users remove own favourites" ON public.favourite_items;
CREATE POLICY "Users remove own favourites" ON public.favourite_items FOR DELETE USING (auth.uid() = user_id);
