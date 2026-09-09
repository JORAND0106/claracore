-- Origen + cantidad manual en precios de subcontratista (Tab Precios unificado).
-- Idempotente.

ALTER TABLE public.subcontratista_precios
  ADD COLUMN IF NOT EXISTS origen text;

ALTER TABLE public.subcontratista_precios
  ADD COLUMN IF NOT EXISTS cantidad_manual numeric(18, 4);

-- Default / backfill: filas existentes sin origen → 'manual'
-- (el flujo antiguo no venía de Presupuesto; las de presupuesto se reetiquetan al guardar desde la hoja).
UPDATE public.subcontratista_precios
   SET origen = 'manual'
 WHERE origen IS NULL OR trim(origen) = '';

ALTER TABLE public.subcontratista_precios
  ALTER COLUMN origen SET DEFAULT 'manual';

ALTER TABLE public.subcontratista_precios
  ALTER COLUMN origen SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subcontratista_precios_origen_check'
  ) THEN
    ALTER TABLE public.subcontratista_precios
      ADD CONSTRAINT subcontratista_precios_origen_check
      CHECK (origen IN ('presupuesto', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.subcontratista_precios.origen IS
  'presupuesto = cantidad desde asignación en Presupuesto; manual = agregado en Tab Precios.';

COMMENT ON COLUMN public.subcontratista_precios.cantidad_manual IS
  'Cantidad editable solo cuando origen=manual (no proviene de Presupuesto).';
