-- Propina opcional en transacciones contables.
-- Ejecutar en Supabase SQL Editor ANTES de desplegar el código de aplicación.
-- Idempotente: seguro re-ejecutar.

ALTER TABLE public.contabilidad_transaccion
  ADD COLUMN IF NOT EXISTS propina numeric(18,2) NOT NULL DEFAULT 0
  CHECK (propina >= 0);

COMMENT ON COLUMN public.contabilidad_transaccion.propina IS
  'Propina u otro cargo opcional en pesos. Se suma al total de la factura.';

NOTIFY pgrst, 'reload schema';
