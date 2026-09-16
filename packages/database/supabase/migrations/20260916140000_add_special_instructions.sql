-- Free-text note a customer can attach to a line item (e.g. "no onions please"),
-- intended to be visible to kitchen staff when preparing the order.
ALTER TABLE public.order_items ADD COLUMN special_instructions TEXT;
