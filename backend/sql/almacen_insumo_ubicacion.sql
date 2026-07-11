-- ClaraCore — Almacén: insumo ampliado + ubicación en solicitud
-- Ejecutar después de almacen_solicitud_insumos.sql y almacen_insumo_impuestos.sql. Idempotente.

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS rendimiento numeric(18, 4);

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS tipo_impuesto text;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS impuesto_porcentaje numeric(8, 4);

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS soporte_pdf_blob_path text;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS soporte_pdf_nombre text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS tramo text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS costado text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS abscisa_inicial numeric(18, 2);

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS abscisa_final numeric(18, 2);

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS observacion_residente text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS pk_id_id integer;

NOTIFY pgrst, 'reload schema';
