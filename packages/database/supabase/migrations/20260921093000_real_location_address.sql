-- Seed data used a placeholder address ("123 Talbot St") -- swapping in the
-- real one. Coordinates for "Use My Location" (index.tsx) still need to be
-- set separately once available.
UPDATE public.locations
SET address = '640 Talbot St, St Thomas, ON'
WHERE name = 'St. Thomas Downtown';
