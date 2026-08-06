-- ============================================================================
-- Diagnóstico + fix: contratos.numero_interventoria / caché PostgREST (PGRST204)
-- ============================================================================
-- Ejecutar en Supabase SQL Editor (proyecto de producción).
-- Orden:
--   1) Bloque VERIFICACIÓN (SELECT al catálogo) — confirmar si la columna existe
--   2) Bloque FIX (ADD IF NOT EXISTS + NOTIFY) — idempotente
--   3) Volver a correr el SELECT de verificación
-- ============================================================================

-- ── 1) VERIFICACIÓN: ¿existe físicamente la columna? ────────────────────────
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'contratos'
  AND c.column_name = 'numero_interventoria';

-- Si el SELECT anterior no devuelve filas → la columna NO existe (migración incompleta).
-- Si devuelve 1 fila → la columna SÍ existe y el error PGRST204 es de caché PostgREST.

-- ── 2) FIX idempotente ──────────────────────────────────────────────────────
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS numero_interventoria text;

COMMENT ON COLUMN public.contratos.numero_interventoria IS
  'Número del contrato de interventoría asociado al contrato de obra (encabezado de actas).';

-- RPC para que el backend pueda pedir reload sin SQL Editor (best-effort).
CREATE OR REPLACE FUNCTION public.sicoe_reload_postgrest_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

REVOKE ALL ON FUNCTION public.sicoe_reload_postgrest_schema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sicoe_reload_postgrest_schema() TO service_role;
GRANT EXECUTE ON FUNCTION public.sicoe_reload_postgrest_schema() TO authenticated;

-- Doble NOTIFY: algunos entornos PostgREST solo recargan en el siguiente ciclo.
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
NOTIFY pgrst, 'reload schema';

-- ── 3) Re-verificación ──────────────────────────────────────────────────────
SELECT
  c.column_name,
  c.data_type,
  'ok: columna presente — si el API sigue en PGRST204, espere ~5s y reintente editar el contrato'
    AS nota
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'contratos'
  AND c.column_name = 'numero_interventoria';
