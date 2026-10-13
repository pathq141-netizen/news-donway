-- Jalankan SEKALI di Supabase SQL Editor untuk mendukung foto di dalam artikel.
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS body_image_url text;
