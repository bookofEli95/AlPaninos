-- Customer-chosen pickup/delivery time (cart.tsx's time-slot picker), as
-- opposed to estimated_ready_at which is always populated (either copied
-- from this, or auto-computed for "ASAP"). Null means the customer picked
-- ASAP rather than a specific slot -- kept separate from estimated_ready_at
-- so staff can tell "we estimated this" from "the customer committed to
-- this exact time" when looking at an order.
ALTER TABLE public.orders ADD COLUMN requested_ready_at TIMESTAMPTZ;
