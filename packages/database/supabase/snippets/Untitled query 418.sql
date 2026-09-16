ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';