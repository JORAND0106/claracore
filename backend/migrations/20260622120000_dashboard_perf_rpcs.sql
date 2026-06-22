-- Performance: capitulos-lista y filtros/capitulos (GROUP BY / DISTINCT en servidor).
-- Ejecutar en Supabase SQL Editor o vía migración.

CREATE OR REPLACE FUNCTION public.presupuesto_capitulos_lista_agg(
  p_contrato_id bigint,
  p_tipo_ejecucion text DEFAULT 'Presupuesto de Obra',
  p_solo_interv_aprobado boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH tipo AS (
  SELECT CASE
    WHEN trim(COALESCE(p_tipo_ejecucion, '')) IN ('Presupuesto de Obra', 'Obra Ejecutada')
      THEN trim(p_tipo_ejecucion)
    ELSE 'Presupuesto de Obra'
  END AS t
),
agg AS (
  SELECT
    COALESCE(p.capitulo, '') AS capitulo,
    SUM(COALESCE(p.costo_directo, 0)::numeric) AS costo_total,
    COUNT(*)::bigint AS total_registros
  FROM public.presupuesto p
  CROSS JOIN tipo
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.tipo_ejecucion = tipo.t
    AND (
      NOT COALESCE(p_solo_interv_aprobado, false)
      OR p.pre_interv_estado IS NULL
      OR trim(p.pre_interv_estado) = 'Aprobado'
    )
  GROUP BY COALESCE(p.capitulo, '')
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'capitulo', a.capitulo,
      'costo_total', a.costo_total,
      'total_registros', a.total_registros
    )
    ORDER BY
      CASE WHEN a.capitulo ~ '^\d+' THEN 0 WHEN a.capitulo = '' THEN 2 ELSE 1 END,
      CASE WHEN a.capitulo ~ '^(\d+)' THEN (substring(a.capitulo FROM '^(\d+)'))::int ELSE 0 END,
      a.capitulo
  ),
  '[]'::jsonb
)
FROM agg a;
$f$;

GRANT EXECUTE ON FUNCTION public.presupuesto_capitulos_lista_agg(bigint, text, boolean)
  TO authenticated, service_role;

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

GRANT EXECUTE ON FUNCTION public.sicoe_filtros_capitulos_distinct(bigint, bigint, bigint, bigint)
  TO authenticated, service_role;
