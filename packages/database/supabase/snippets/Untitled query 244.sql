ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00;
NOTIFY pgrst, 'reload schema';