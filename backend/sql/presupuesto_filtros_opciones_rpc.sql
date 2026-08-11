-- Opciones de filtros presupuesto: DISTINCT en servidor (sin paginar 40k filas).
-- Ejecutar en Supabase SQL Editor o vía migración.

CREATE OR REPLACE FUNCTION public.presupuesto_filtros_opciones(
  p_contrato_id integer,
  p_tipo_ejecucion text DEFAULT NULL,
  p_capitulo text DEFAULT NULL,
  p_item text DEFAULT NULL,
  p_tramo text DEFAULT NULL,
  p_calzada text DEFAULT NULL,
  p_filtrar_interv boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH tipo_resuelto AS (
    SELECT CASE
      WHEN trim(coalesce(p_tipo_ejecucion, '')) IN ('Presupuesto de Obra', 'Obra Ejecutada')
        THEN trim(p_tipo_ejecucion)
      ELSE 'Presupuesto de Obra'
    END AS te
  ),
  base AS (
    SELECT
      p.capitulo,
      p.item,
      p.tramo,
      p.calzada,
      p.competencia,
      p.und,
      p.revisado,
      coalesce(nullif(trim(p.pre_interv_estado), ''), 'No Revisado') AS pre_interv_norm,
      p.sellado,
      p.dado_de_baja
    FROM public.presupuesto p
    CROSS JOIN tipo_resuelto tr
    WHERE p.contrato_id = p_contrato_id
      AND p.dado_de_baja = false
      AND p.tipo_ejecucion = tr.te
      AND (p_capitulo IS NULL OR trim(p_capitulo) = '' OR p.capitulo = p_capitulo)
      AND (p_item IS NULL OR trim(p_item) = '' OR p.item = p_item)
      AND (p_tramo IS NULL OR trim(p_tramo) = '' OR p.tramo = p_tramo)
      AND (p_calzada IS NULL OR trim(p_calzada) = '' OR p.calzada = p_calzada)
      AND (
        NOT coalesce(p_filtrar_interv, true)
        OR p.pre_interv_estado = 'Aprobado'
      )
  ),
  tipos AS (
    SELECT DISTINCT trim(p.tipo_ejecucion) AS te
    FROM public.presupuesto p
    WHERE p.contrato_id = p_contrato_id
      AND p.dado_de_baja = false
      AND p.tipo_ejecucion IS NOT NULL
      AND trim(p.tipo_ejecucion) IN ('Presupuesto de Obra', 'Obra Ejecutada')
      AND (
        NOT coalesce(p_filtrar_interv, true)
        OR p.pre_interv_estado = 'Aprobado'
      )
  )
  SELECT jsonb_build_object(
    'capitulos', coalesce(
      (SELECT jsonb_agg(DISTINCT capitulo ORDER BY capitulo)
       FROM base WHERE capitulo IS NOT NULL AND trim(capitulo) <> ''),
      '[]'::jsonb
    ),
    'items', '[]'::jsonb,
    'tramos', coalesce(
      (SELECT jsonb_agg(DISTINCT tramo ORDER BY tramo)
       FROM base WHERE tramo IS NOT NULL AND trim(tramo::text) <> ''),
      '[]'::jsonb
    ),
    'calzadas', coalesce(
      (SELECT jsonb_agg(DISTINCT calzada ORDER BY calzada)
       FROM base WHERE calzada IS NOT NULL AND trim(calzada::text) <> ''),
      '[]'::jsonb
    ),
    'infraestructuras', coalesce(
      (SELECT jsonb_agg(DISTINCT trim(pk.infraestructura) ORDER BY trim(pk.infraestructura))
       FROM public.pk_ids pk
       WHERE pk.contrato_id = p_contrato_id
         AND pk.infraestructura IS NOT NULL
         AND trim(pk.infraestructura::text) <> ''),
      '[]'::jsonb
    ),
    'competencias', coalesce(
      (SELECT jsonb_agg(DISTINCT competencia ORDER BY competencia)
       FROM base WHERE competencia IS NOT NULL AND trim(competencia) <> ''),
      '[]'::jsonb
    ),
    'unds', coalesce(
      (SELECT jsonb_agg(DISTINCT und ORDER BY und)
       FROM base WHERE und IS NOT NULL AND trim(und) <> ''),
      '[]'::jsonb
    ),
    'revisados', coalesce(
      (SELECT jsonb_agg(DISTINCT revisado ORDER BY revisado)
       FROM base WHERE revisado IS NOT NULL AND trim(revisado) <> ''),
      '[]'::jsonb
    ),
    'pre_interv_estados', coalesce(
      (SELECT jsonb_agg(DISTINCT pre_interv_norm ORDER BY pre_interv_norm)
       FROM base),
      '[]'::jsonb
    ),
    'sellados', coalesce(
      (SELECT jsonb_agg(DISTINCT sellado ORDER BY sellado) FROM base),
      '[]'::jsonb
    ),
    'dados_de_baja', coalesce(
      (SELECT jsonb_agg(DISTINCT dado_de_baja ORDER BY dado_de_baja) FROM base),
      '[]'::jsonb
    ),
    'tipos_ejecucion', coalesce(
      (SELECT jsonb_agg(te ORDER BY te) FROM tipos),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.presupuesto_filtros_opciones IS
  'Valores distintos para filtros de presupuesto (cascada en servidor, sin paginar filas).';

GRANT EXECUTE ON FUNCTION public.presupuesto_filtros_opciones TO authenticated;
GRANT EXECUTE ON FUNCTION public.presupuesto_filtros_opciones TO service_role;
