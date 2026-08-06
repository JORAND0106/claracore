-- Idempotente: asegura contratos.numero_interventoria + recarga caché PostgREST.
-- Corrige PGRST204 recurrente tras despliegues / reinicios de API.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS numero_interventoria text;

COMMENT ON COLUMN public.contratos.numero_interventoria IS
  'Número del contrato de interventoría asociado al contrato de obra (encabezado de actas).';

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
SELECT pg_notify('pgrst', 'reload schema');
NOTIFY pgrst, 'reload schema';
