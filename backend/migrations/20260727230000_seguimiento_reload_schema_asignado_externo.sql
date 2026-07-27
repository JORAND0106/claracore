-- Idempotente: para entornos donde ya se aplicó la columna asignado_externo_id
-- pero PostgREST / el backend siguen reportando que falta el esquema.
-- Ejecutar en Supabase SQL Editor si el error persiste tras la migración de columna.

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

NOTIFY pgrst, 'reload schema';
