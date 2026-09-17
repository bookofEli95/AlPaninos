-- Guest checkout now collects an email (guests have no auth email), and both
-- guests and registered users pick how they want order-status updates sent.
ALTER TABLE public.orders ADD COLUMN customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.orders ADD COLUMN notify_sms BOOLEAN NOT NULL DEFAULT false;

-- Registered users set a default notification preference at signup
-- (register.tsx), editable later from edit-profile.tsx; each order can still
-- override it at checkout.
ALTER TABLE public.profiles ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN notify_sms BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, coalesce(new.email, 'guest@alpaninos.local'), 'customer');

  INSERT INTO public.profiles (id, first_name, last_name, phone, address, notify_email, notify_sms)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address',
    COALESCE((new.raw_user_meta_data->>'notify_email')::boolean, true),
    COALESCE((new.raw_user_meta_data->>'notify_sms')::boolean, false)
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
