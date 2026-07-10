-- Proveedor en transacciones de egreso (razón social + NIT).
-- Ejecutar en Supabase SQL Editor. Idempotente: seguro re-ejecutar.

ALTER TABLE public.contabilidad_transaccion
  ADD COLUMN IF NOT EXISTS proveedor_razon_social text;

ALTER TABLE public.contabilidad_transaccion
  ADD COLUMN IF NOT EXISTS proveedor_nit text;

COMMENT ON COLUMN public.contabilidad_transaccion.proveedor_razon_social IS
  'Razón social del proveedor. Obligatorio en egresos; NULL en ingresos.';

COMMENT ON COLUMN public.contabilidad_transaccion.proveedor_nit IS
  'NIT del proveedor. Obligatorio en egresos; NULL en ingresos.';

-- Egresos existentes sin proveedor: no se fuerza NOT NULL para no romper datos previos.
-- La obligatoriedad se valida en la API al crear/editar egresos.

ALTER TABLE public.contabilidad_transaccion
  DROP CONSTRAINT IF EXISTS contabilidad_tx_proveedor_egreso_check;

ALTER TABLE public.contabilidad_transaccion
  ADD CONSTRAINT contabilidad_tx_proveedor_egreso_check CHECK (
    (tipo = 'ingreso' AND proveedor_razon_social IS NULL AND proveedor_nit IS NULL)
    OR (tipo = 'egreso')
  );

NOTIFY pgrst, 'reload schema';
