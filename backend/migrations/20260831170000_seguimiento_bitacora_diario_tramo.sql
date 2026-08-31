-- Segmentación Reporte Diario por Tramo.
-- Unicidad: un diario por (contrato, fecha, tramo).
-- Legacy sin tramo: NULL en BD → UI «Tramo no especificado».

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS tramo text;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.tramo IS
  'Tramo del contrato (maestro PK). NULL = legado / no especificado.';

DROP INDEX IF EXISTS public.uq_seg_bitacora_diario_contrato_fecha;

-- COALESCE permite una sola fila NULL (legado) por fecha+contrato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_diario_contrato_fecha_tramo
  ON public.seguimiento_bitacora_entrada (contrato_id, fecha, (COALESCE(tramo, '')))
  WHERE tipo = 'diario';
