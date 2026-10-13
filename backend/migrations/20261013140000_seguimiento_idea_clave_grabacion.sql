-- Clave estable del tema (od-N / manual-* / suelta-*) para no duplicar al resegar desde Orden del Día.

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS clave_grabacion text;

COMMENT ON COLUMN public.seguimiento_acta_idea.clave_grabacion IS
  'Clave de tema en el editor (od-1..N, manual-*, suelta-*). Evita duplicados al resegar desde el orden del día.';

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_idea_clave
  ON public.seguimiento_acta_idea (acta_id, clave_grabacion)
  WHERE clave_grabacion IS NOT NULL;

NOTIFY pgrst, 'reload schema';
