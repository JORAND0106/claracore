-- Cantidad/valor negociado con proveedor + flag de alerta en solicitudes
-- Idempotente. Ejecutar después de catalogo_insumos_modulo.sql.

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS cantidad_negociada numeric(18, 4),
  ADD COLUMN IF NOT EXISTS valor_negociado_total numeric(18, 2);

COMMENT ON COLUMN public.almacen_insumo.cantidad_negociada IS
  'Volumen total pactado con el proveedor para este insumo en el contrato';
COMMENT ON COLUMN public.almacen_insumo.valor_negociado_total IS
  'Valor total del negocio pactado para cantidad_negociada';

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS supera_negociado boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
