-- Perfil de usuario: cumpleaños, foto y firma (ejecutar en Supabase SQL).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil_url text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS firma_imagen_url text;
