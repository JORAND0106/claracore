-- Almacén: insumo principal vs asociado en líneas de solicitud
-- Idempotente — ejecutar en Supabase SQL Editor o vía migración.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.almacen_solicitud_item.es_principal IS
  'true = consume presupuesto del ítem; false = insumo asociado (no descuenta saldo ni alerta sobrepresupuesto).';

NOTIFY pgrst, 'reload schema';
