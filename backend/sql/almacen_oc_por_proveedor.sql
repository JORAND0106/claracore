-- Una Orden de Compra por proveedor (varias OC por solicitud).
-- Quita UNIQUE(solicitud_id) y agrega proveedor en el encabezado de la OC.
-- Preferir la migración crítica:
--   backend/migrations/20261026200000_almacen_oc_multi_proveedor_unique.sql
-- o el script listo para Supabase:
--   backend/sql/almacen_oc_multi_proveedor_unique.sql

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'almacen_orden_compra'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ~* 'solicitud_id'
      AND pg_get_constraintdef(con.oid) !~* 'proveedor'
      AND pg_get_constraintdef(con.oid) !~* 'numero_oc'
      AND pg_get_constraintdef(con.oid) !~* 'contrato_id'
  LOOP
    EXECUTE format('ALTER TABLE public.almacen_orden_compra DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.almacen_orden_compra_solicitud_id_key;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud
  ON public.almacen_orden_compra (solicitud_id);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor
  ON public.almacen_orden_compra (solicitud_id, proveedor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor_id_uq
  ON public.almacen_orden_compra (solicitud_id, proveedor_id)
  WHERE proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor_nombre_uq
  ON public.almacen_orden_compra (solicitud_id, lower(trim(proveedor_nombre)))
  WHERE proveedor_id IS NULL
    AND proveedor_nombre IS NOT NULL
    AND btrim(proveedor_nombre) <> '';

NOTIFY pgrst, 'reload schema';
