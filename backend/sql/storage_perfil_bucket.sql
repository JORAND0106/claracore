-- Bucket público para foto de perfil e imagen de firma (Supabase Storage).
-- El backend intenta crearlo por API; si falla, ejecuta esto en el SQL Editor.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('claracore-perfiles', 'claracore-perfiles', true, 6291456)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 6291456;
