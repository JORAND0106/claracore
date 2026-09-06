-- Catálogo de insumos: consecutivo = último activo + 1 (sin rellenar huecos).
-- Libera códigos de insumos inactivos y restringe UNIQUE solo a activos,
-- para que un catálogo vacío pueda reiniciar en …-001.
-- Idempotente.

-- 1) Liberar códigos retenidos por soft-delete previo
UPDATE public.almacen_insumo
SET codigo = codigo || '~D' || id::text
WHERE activo = false
  AND codigo !~* '~D[0-9]+$';

-- 2) UNIQUE solo entre insumos activos (permite histórico inactivo liberado)
ALTER TABLE public.almacen_insumo
  DROP CONSTRAINT IF EXISTS almacen_insumo_uq;

DROP INDEX IF EXISTS public.idx_almacen_insumo_codigo_activo_uq;

CREATE UNIQUE INDEX idx_almacen_insumo_codigo_activo_uq
  ON public.almacen_insumo (contrato_id, codigo)
  WHERE activo = true;

NOTIFY pgrst, 'reload schema';
