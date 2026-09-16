-- 1. ENABLE RLS ON ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

-- 2. CREATE STAFF CHECK HELPER
-- SECURITY DEFINER bypasses RLS to check the user's role without infinite recursion
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. SYNC NEW AUTH USERS TO PUBLIC.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, coalesce(new.email, 'guest@alpaninos.local'), 'customer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. USERS POLICIES
CREATE POLICY "Users can view own record" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own record" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Staff can view all users" ON public.users FOR SELECT USING (public.is_staff());

-- 5. MENU & LOCATIONS POLICIES (Public read, Staff write)
CREATE POLICY "Public read locations" ON public.locations FOR SELECT USING (true);
CREATE POLICY "Staff manage locations" ON public.locations USING (public.is_staff());

CREATE POLICY "Public read menu categories" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Staff manage menu categories" ON public.menu_categories USING (public.is_staff());

CREATE POLICY "Public read menu items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Staff manage menu items" ON public.menu_items USING (public.is_staff());

CREATE POLICY "Public read modifier groups" ON public.modifier_groups FOR SELECT USING (true);
CREATE POLICY "Staff manage modifier groups" ON public.modifier_groups USING (public.is_staff());

CREATE POLICY "Public read modifier options" ON public.modifier_options FOR SELECT USING (true);
CREATE POLICY "Staff manage modifier options" ON public.modifier_options USING (public.is_staff());

-- 6. ORDERS POLICIES (Customers read/write own, Staff read/write all)
CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage all orders" ON public.orders USING (public.is_staff());

CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Users insert own order items" ON public.order_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Staff manage all order items" ON public.order_items USING (public.is_staff());

CREATE POLICY "Users view own item modifiers" ON public.order_item_modifiers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.orders ON order_items.order_id = orders.id
    WHERE public.order_item_modifiers.order_item_id = order_items.id AND orders.user_id = auth.uid()
  )
);
CREATE POLICY "Users insert own item modifiers" ON public.order_item_modifiers FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items 
    JOIN public.orders ON order_items.order_id = orders.id
    WHERE public.order_item_modifiers.order_item_id = order_items.id AND orders.user_id = auth.uid()
  )
);
CREATE POLICY "Staff manage all item modifiers" ON public.order_item_modifiers USING (public.is_staff());