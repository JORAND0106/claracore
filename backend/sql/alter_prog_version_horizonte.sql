-- Horizonte de cronograma por versión (inicio/fin) para CPM backward pass
BEGIN;

ALTER TABLE public.prog_versiones
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date;

COMMENT ON COLUMN public.prog_versiones.fecha_inicio IS
  'Fecha inicio del cronograma de la versión; ancla el forward pass para nodos sin restricción manual.';
COMMENT ON COLUMN public.prog_versiones.fecha_fin IS
  'Fecha fin del cronograma de la versión; horizonte del backward pass CPM (no la última actividad).';

COMMIT;
