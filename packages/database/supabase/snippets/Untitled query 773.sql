ALTER TABLE public.modifier_groups  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.modifier_options ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.menu_items       ADD COLUMN IF NOT EXISTS upsell_group TEXT;