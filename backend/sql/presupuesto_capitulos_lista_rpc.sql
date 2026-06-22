-- Agregado por capítulo para GET /presupuesto/{contrato_id}/capitulos-lista
-- Ejecutar en Supabase SQL Editor (idempotente).

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

COMMENT ON FUNCTION public.presupuesto_capitulos_lista_agg(bigint, text, boolean) IS
  'Totales por capítulo (costo_directo, count) para capitulos-lista; reemplaza scan PostgREST.';

GRANT EXECUTE ON FUNCTION public.presupuesto_capitulos_lista_agg(bigint, text, boolean)
  TO authenticated, service_role;
