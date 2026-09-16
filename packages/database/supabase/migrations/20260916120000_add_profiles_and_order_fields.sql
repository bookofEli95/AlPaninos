-- Add an in-progress status for delivery orders (order/[id].tsx tracks a
-- distinct "on the way" step for deliveries, which had no matching enum value)
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'out_for_delivery' AFTER 'preparing';

-- Rename to match the column name the app actually reads/writes, and add the
-- guest/registered contact info captured at checkout time
ALTER TABLE public.orders RENAME COLUMN type TO order_type;
ALTER TABLE public.orders ADD COLUMN customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN customer_phone TEXT;

-- Store the computed line total (unit_price * quantity + modifiers) alongside
-- unit_price so order history can display it without recomputing client-side
ALTER TABLE public.order_items ADD COLUMN total_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Customer profile info collected at signup (register.tsx / profile.tsx)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (public.is_staff());

-- Populate profiles from signup metadata: register.tsx passes first_name/last_name/
-- phone/address via supabase.auth.signUp's options.data, which lands in raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, coalesce(new.email, 'guest@alpaninos.local'), 'customer');

  INSERT INTO public.profiles (id, first_name, last_name, phone, address)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
