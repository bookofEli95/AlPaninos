-- Neither modifier_groups nor modifier_options has ever had an explicit
-- order column -- the item screen's queries (item/[id].tsx) have no
-- ORDER BY at all, so display order has only ever been whatever order
-- Postgres happens to return rows in (in practice, insertion order, but
-- never guaranteed and liable to drift after any UPDATE). Menu.csv's
-- modifier lists were just cleaned up into a deliberate order (removals,
-- then substitutions, then additions, then everything else) -- for that
-- to actually show up in the app, and to stay reliable going forward,
-- display order needs to be real, queryable data instead of an implicit
-- side effect of row storage.
ALTER TABLE public.modifier_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.modifier_options ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
