UPDATE public.menu_items
SET image_url = REPLACE(image_url, 'http://127.0.0.1:54321/storage/', 'http://192.168.0.113:54321/storage/')
WHERE image_url IS NOT NULL 
  AND image_url LIKE 'http://127.0.0.1:54321/storage/%';