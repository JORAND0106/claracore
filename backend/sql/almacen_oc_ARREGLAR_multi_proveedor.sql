-- =============================================================================
-- ARREGLO URGENTE: permitir varias OC por solicitud (una por proveedor)
-- Pegar TODO este bloque en Supabase → SQL Editor → Run
-- Idempotente. No borra OC existentes. Solo cambia la restricción.
-- Tras Success: volver a Generar en "Notificar al comercial".
-- =============================================================================

-- 1) Quitar UNIQUE solo sobre solicitud_id (causa del error 23505)
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
    RAISE NOTICE 'Constraint eliminada: %', cname;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.almacen_orden_compra_solicitud_id_key;

-- 2) Columnas de proveedor en el encabezado (si faltan)
ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

-- 3) Índices de consulta
CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud
  ON public.almacen_orden_compra (solicitud_id);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor
  ON public.almacen_orden_compra (solicitud_id, proveedor_id);

-- 4) Una OC por proveedor (con id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor_id_uq
  ON public.almacen_orden_compra (solicitud_id, proveedor_id)
  WHERE proveedor_id IS NOT NULL;

-- 5) Una OC por nombre cuando no hay proveedor_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_oc_solicitud_proveedor_nombre_uq
  ON public.almacen_orden_compra (solicitud_id, lower(trim(proveedor_nombre)))
  WHERE proveedor_id IS NULL
    AND proveedor_nombre IS NOT NULL
    AND btrim(proveedor_nombre) <> '';

-- 6) Recargar esquema PostgREST
NOTIFY pgrst, 'reload schema';

-- 7) Comprobación: ya no debe aparecer UNIQUE solo de solicitud_id
SELECT con.conname AS restriccion, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'almacen_orden_compra'
  AND con.contype = 'u'
ORDER BY 1;
