-- Espejo de migrations/20260727230000_seguimiento_reload_schema_asignado_externo.sql
-- Usar si la columna asignado_externo_id ya existe pero el error de esquema persiste.

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
