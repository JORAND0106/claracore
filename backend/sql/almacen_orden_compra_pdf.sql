-- ClaraCore — Almacén: PDF de Orden de Compra
-- Idempotente.

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS pdf_blob_path text;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS pdf_nombre text;

NOTIFY pgrst, 'reload schema';
