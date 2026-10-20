-- Historial de fotos por registro (varias fotos sin borrar las existentes).
-- Ejecutar en SQL Editor de Supabase.
-- foto_url / foto_numero siguen siendo la foto activa (la más reciente).

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS fotos_historial jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.so_registros.fotos_historial IS
  'Lista JSON [{url, numero, creado_en, origen}] de fotos del registro; foto_url es la activa/más reciente.';
