-- Una Orden de Compra por proveedor (varias OC por solicitud).
-- Quita UNIQUE(solicitud_id) y agrega proveedor en el encabezado de la OC.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'almacen_orden_compra'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%solicitud_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.almacen_orden_compra DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud
  ON public.almacen_orden_compra (solicitud_id);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor
  ON public.almacen_orden_compra (solicitud_id, proveedor_id);
