-- Asegura columnas de proveedor en encabezado de OC (fixa PGRST204 al generar OC).
-- Idempotente. Tras ejecutar: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud
  ON public.almacen_orden_compra (solicitud_id);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor
  ON public.almacen_orden_compra (solicitud_id, proveedor_id);

NOTIFY pgrst, 'reload schema';
