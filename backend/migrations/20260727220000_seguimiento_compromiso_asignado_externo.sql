-- Compromisos asignables a contactos externos (asistentes sin usuario de plataforma).

ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS asignado_externo_id bigint
    REFERENCES public.seguimiento_contacto_externo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_asignado_externo
  ON public.seguimiento_item (asignado_externo_id)
  WHERE asignado_externo_id IS NOT NULL;

COMMENT ON COLUMN public.seguimiento_item.asignado_externo_id IS
  'Contacto externo asignado a un compromiso de acta (sin login).';

-- Relajar CHECK: asignado_a_id O asignado_externo_id (más nombre).
ALTER TABLE public.seguimiento_item
  DROP CONSTRAINT IF EXISTS seguimiento_item_compromiso_req;

ALTER TABLE public.seguimiento_item
  ADD CONSTRAINT seguimiento_item_compromiso_req CHECK (
    origen <> 'compromiso'
    OR (
      contrato_id IS NOT NULL
      AND acta_id IS NOT NULL
      AND solicitante_id IS NOT NULL
      AND fecha_vencimiento IS NOT NULL
      AND (
        asignado_a_id IS NOT NULL
        OR asignado_externo_id IS NOT NULL
      )
    )
  );

-- RPC para forzar recarga del schema cache de PostgREST desde el backend.
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
