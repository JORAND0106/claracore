-- Capítulos distintos para GET /sicoe-obra/{contrato_id}/filtros/capitulos
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE OR REPLACE FUNCTION public.sicoe_filtros_capitulos_distinct(
  p_contrato_id bigint,
  p_acta_rpo_id bigint DEFAULT NULL,
  p_semana_id bigint DEFAULT NULL,
  p_subcontratista_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
SELECT COALESCE(
  jsonb_agg(d.capitulo ORDER BY
    CASE WHEN d.capitulo ~ '^\d+' THEN 0 ELSE 1 END,
    CASE WHEN d.capitulo ~ '^(\d+)' THEN (substring(d.capitulo FROM '^(\d+)'))::int ELSE 9999 END,
    d.capitulo
  ),
  '[]'::jsonb
)
FROM (
  SELECT DISTINCT r.capitulo
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND r.capitulo IS NOT NULL
    AND (p_acta_rpo_id IS NULL OR r.acta_rpo_id = p_acta_rpo_id)
    AND (p_semana_id IS NULL OR r.semana_id = p_semana_id)
    AND (p_subcontratista_id IS NULL OR r.subcontratista_id = p_subcontratista_id)
) d;
$f$;

COMMENT ON FUNCTION public.sicoe_filtros_capitulos_distinct(bigint, bigint, bigint, bigint) IS
  'SELECT DISTINCT capitulo en so_registros con filtros opcionales; reemplaza scan PostgREST.';

GRANT EXECUTE ON FUNCTION public.sicoe_filtros_capitulos_distinct(bigint, bigint, bigint, bigint)
  TO authenticated, service_role;
