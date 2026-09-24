-- The London store never had coordinates (only St. Thomas did -- see the
-- location_coordinates migration), so "Use My Location" couldn't show its
-- distance and catering's 60 km delivery check was skipped for it.
UPDATE public.locations
SET latitude = 42.98781154506752,
    longitude = -81.25081940169568
WHERE name = 'London - Richmond St';
