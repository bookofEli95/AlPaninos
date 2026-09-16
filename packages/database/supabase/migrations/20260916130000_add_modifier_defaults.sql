-- Lets a modifier option start pre-selected (e.g. a combo's included side/drink)
ALTER TABLE public.modifier_options ADD COLUMN is_default BOOLEAN DEFAULT false NOT NULL;
