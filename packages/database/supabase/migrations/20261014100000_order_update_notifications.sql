-- Order updates that actually reach the customer.
--
-- 1. The status-change webhook (the push_notifications migration) pointed at
--    http://host.docker.internal:54321 -- the CLI's local Edge Functions
--    server, which only exists on a development machine. On the hosted
--    project nothing answers there, so no update was ever sent. It now
--    points at the hosted project's send-order-notification function
--    (deployed with verify_jwt = false -- see config.toml -- and it only
--    trusts the order id in the payload: it re-reads the order itself).
--
-- 2. send-order-notification now also emails the customer (when the order
--    asked for email updates) as their order becomes ready, goes out for
--    delivery, or is cancelled. emailed_statuses records which of those
--    emails went out, so a repeated webhook can never send one twice.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS emailed_statuses TEXT[] NOT NULL DEFAULT '{}';

DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://wyiubpjcnzglndapsctu.supabase.co/functions/v1/send-order-notification',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000'
  );
