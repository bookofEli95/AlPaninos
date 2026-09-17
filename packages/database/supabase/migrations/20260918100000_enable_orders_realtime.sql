-- orders.tsx and order/[id].tsx have both been subscribing to postgres_changes
-- on this table since early in the project, but a table only actually
-- broadcasts changes once it's added to the realtime publication -- without
-- this, those subscriptions were silently no-ops the whole time (a new
-- order wouldn't show up in an already-open Orders list, and a status
-- change wouldn't live-update an open order-tracking screen).
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Full replica identity so UPDATE events carry the complete old row, not
-- just the primary key, in case a listener ever needs to compare old vs new
-- column values (e.g. what actually changed).
ALTER TABLE public.orders REPLICA IDENTITY FULL;
