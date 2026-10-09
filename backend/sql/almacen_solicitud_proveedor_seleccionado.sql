-- Proveedor elegido en la revisión de línea (puede no ser la cotización ganadora).
-- Idempotente. Ejecutar con un rol que pueda alterar el esquema.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS proveedor_seleccionado_id bigint,
  ADD COLUMN IF NOT EXISTS proveedor_seleccionado_nombre text,
  ADD COLUMN IF NOT EXISTS cotizacion_numero_seleccionada text;

COMMENT ON COLUMN public.almacen_solicitud_item.proveedor_seleccionado_id IS
  'Proveedor de la cotización elegida para comprar el insumo de la línea.';
COMMENT ON COLUMN public.almacen_solicitud_item.proveedor_seleccionado_nombre IS
  'Nombre del proveedor elegido. Se usa para agrupar la orden de compra.';
COMMENT ON COLUMN public.almacen_solicitud_item.cotizacion_numero_seleccionada IS
  'Número de la cotización del proveedor elegido.';

NOTIFY pgrst, 'reload schema';
