-- Customer Support's one-tap topic chips (Food Quality, Missing Item, ...).
-- Nullable -- picking a topic is optional, and every row submitted before
-- this existed simply has none. Free text rather than an enum so adding or
-- renaming a chip in the app never needs another migration.
ALTER TABLE public.customer_feedback ADD COLUMN IF NOT EXISTS topic TEXT;
