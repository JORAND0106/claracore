-- Espejo de migrations/20260730140000_seguimiento_idea_titulo.sql

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS titulo text;

COMMENT ON COLUMN public.seguimiento_acta_idea.titulo IS
  'Título corto institucional del tema (generado por Clara a partir del texto).';

NOTIFY pgrst, 'reload schema';
