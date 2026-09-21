-- Menu screen redesign: category grid tiles need their own image, separate
-- from any individual item's photo. Left null until the owner uploads one
-- per category via Studio -- shown with a placeholder icon until then.
ALTER TABLE public.menu_categories ADD COLUMN image_url TEXT;
