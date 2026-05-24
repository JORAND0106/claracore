-- AIU de referencia guardado al crear cada versión de presupuesto.
ALTER TABLE public.presupuesto_versiones
  ADD COLUMN IF NOT EXISTS aiu_porcentaje numeric(8, 4);

COMMENT ON COLUMN public.presupuesto_versiones.aiu_porcentaje IS
  'Porcentaje AIU de referencia capturado al crear la versión (comparador y totales).';
