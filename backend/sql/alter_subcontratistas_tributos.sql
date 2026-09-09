-- AIU/IVA único a nivel de subcontratista (aplica a todos sus ítems de cobro).
-- Idempotente.

ALTER TABLE public.subcontratistas
  ADD COLUMN IF NOT EXISTS tributos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.subcontratistas.tributos IS
  'Desglose A/Í/U/IVA único del subcontratista (puntos %). Aplica a todos los VU Costo M.O. del Tab Precios.';

NOTIFY pgrst, 'reload schema';
