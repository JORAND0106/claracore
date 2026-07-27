-- Autor declarado de cada idea central del acta ("Quién dijo").
-- Fuente de sugerencias en UI: asistentes del acta (usuarios o externos).

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS quien_dijo text;

COMMENT ON COLUMN public.seguimiento_acta_idea.quien_dijo IS
  'Nombre de quien planteó la idea (libre o asistente del acta).';
