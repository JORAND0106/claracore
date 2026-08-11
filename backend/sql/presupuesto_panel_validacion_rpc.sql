-- Agregado ligero para panel de validación Interventoría (capítulo / ítem × estado).
-- Evita paginar 40k+ filas en la app. Ejecutar en Supabase SQL Editor o migración.

-- Abscisas en presupuesto son varchar (ej. "+1250.5"); convierte a número para rangos.
CREATE OR REPLACE FUNCTION public.ppto_abs_a_numeric(v text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  s := replace(btrim(coalesce(v, '')), '+', '');
  IF s = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN s::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.presupuesto_panel_validacion_interv(
  p_contrato_id integer,
  p_tipo_ejecucion text DEFAULT NULL,
  p_nivel text DEFAULT 'capitulo',
  p_capitulo text DEFAULT NULL,
  p_filtrar_interv boolean DEFAULT true,
  p_filtros jsonb DEFAULT '{}'::jsonb
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
  f AS (
    SELECT coalesce(p_filtros, '{}'::jsonb) AS j
  ),
  base AS (
    SELECT
      p.capitulo,
      CASE
        WHEN lower(trim(coalesce(p_nivel, 'capitulo'))) = 'item' THEN p.item
        ELSE NULL
      END AS item,
      max(trim(coalesce(p.descripcion, ''))) AS descripcion,
      max(trim(coalesce(p.und, ''))) AS und,
      coalesce(
        nullif(trim(coalesce(p.revisado, '')), ''),
        'No Revisado'
      ) AS estado_norm,
      count(*)::bigint AS registros,
      coalesce(sum(coalesce(p.costo_directo, 0)), 0)::numeric AS costo_directo,
      coalesce(sum(coalesce(p.cant_total, 0)), 0)::numeric AS cant_total
    FROM public.presupuesto p
    CROSS JOIN tipo_resuelto tr
    CROSS JOIN f
    WHERE p.contrato_id = p_contrato_id
      AND p.dado_de_baja = false
      AND p.tipo_ejecucion = tr.te
      AND (
        NOT coalesce(p_filtrar_interv, true)
        OR p.pre_interv_estado = 'Aprobado'
      )
      -- Drill panel ítems
      AND (
        lower(trim(coalesce(p_nivel, 'capitulo'))) <> 'item'
        OR (
          trim(coalesce(p_capitulo, '')) <> ''
          AND p.capitulo = trim(p_capitulo)
        )
      )
      -- Filtros JSON (misma semántica que GET /presupuesto)
      AND (
        NOT (f.j ? 'capitulos')
        OR jsonb_array_length(f.j->'capitulos') = 0
        OR p.capitulo IN (SELECT jsonb_array_elements_text(f.j->'capitulos'))
      )
      AND (
        NOT (f.j ? 'items')
        OR jsonb_array_length(f.j->'items') = 0
        OR p.item IN (SELECT jsonb_array_elements_text(f.j->'items'))
      )
      AND (
        NOT (f.j ? 'tramos')
        OR jsonb_array_length(f.j->'tramos') = 0
        OR p.tramo::text IN (SELECT jsonb_array_elements_text(f.j->'tramos'))
      )
      AND (
        NOT (f.j ? 'calzadas')
        OR jsonb_array_length(f.j->'calzadas') = 0
        OR p.calzada::text IN (SELECT jsonb_array_elements_text(f.j->'calzadas'))
      )
      AND (
        NOT (f.j ? 'infraestructuras')
        OR jsonb_array_length(f.j->'infraestructuras') = 0
        OR EXISTS (
          SELECT 1
          FROM public.pk_ids pk
          WHERE pk.contrato_id = p.contrato_id
            AND pk.pk_id = p.pk_id
            AND pk.infraestructura::text IN (
              SELECT jsonb_array_elements_text(f.j->'infraestructuras')
            )
        )
      )
      AND (
        NOT (f.j ? 'competencias')
        OR jsonb_array_length(f.j->'competencias') = 0
        OR p.competencia IN (SELECT jsonb_array_elements_text(f.j->'competencias'))
      )
      AND (
        NOT (f.j ? 'unds')
        OR jsonb_array_length(f.j->'unds') = 0
        OR p.und IN (SELECT jsonb_array_elements_text(f.j->'unds'))
      )
      AND (
        coalesce(nullif(trim(f.j->>'revisado'), ''), '') = ''
        OR (
          lower(trim(f.j->>'revisado')) IN ('no revisado', 'no revisados')
          AND (p.revisado IS NULL OR trim(p.revisado) = 'No Revisado')
        )
        OR trim(p.revisado) = trim(f.j->>'revisado')
      )
      AND (
        coalesce(nullif(trim(f.j->>'pre_interv_estado'), ''), '') = ''
        OR (
          lower(trim(f.j->>'pre_interv_estado')) IN ('no revisado', '—', '-')
          AND p.pre_interv_estado IS NULL
        )
        OR trim(p.pre_interv_estado) = trim(f.j->>'pre_interv_estado')
      )
      AND (
        coalesce(nullif(trim(f.j->>'nodo_inicio'), ''), '') = ''
        OR p.no_inicio ILIKE '%' || trim(f.j->>'nodo_inicio') || '%'
      )
      AND (
        coalesce(nullif(trim(f.j->>'nodo_final'), ''), '') = ''
        OR p.no_final ILIKE '%' || trim(f.j->>'nodo_final') || '%'
      )
      AND (
        coalesce(nullif(trim(f.j->>'id_pol'), ''), '') = ''
        OR p.id_pol ILIKE '%' || trim(f.j->>'id_pol') || '%'
      )
      AND (
        coalesce(nullif(trim(f.j->>'pk_criterio'), ''), '') = ''
        OR coalesce(p.pk_id::text, '') ILIKE '%' || trim(f.j->>'pk_criterio') || '%'
      )
      AND (
        coalesce(nullif(trim(f.j->>'texto'), ''), '') = ''
        OR p.descripcion ILIKE '%' || trim(f.j->>'texto') || '%'
        OR coalesce(p.id_pol, '') ILIKE '%' || trim(f.j->>'texto') || '%'
        OR coalesce(p.pk_id::text, '') ILIKE '%' || trim(f.j->>'texto') || '%'
        OR coalesce(p.observacion, '') ILIKE '%' || trim(f.j->>'texto') || '%'
        OR coalesce(p.item::text, '') ILIKE '%' || trim(f.j->>'texto') || '%'
      )
      AND (
        coalesce(nullif(trim(f.j->>'buscar'), ''), '') = ''
        OR coalesce(p.id_pol, '') ILIKE '%' || trim(f.j->>'buscar') || '%'
        OR coalesce(p.pk_id::text, '') ILIKE '%' || trim(f.j->>'buscar') || '%'
        OR p.descripcion ILIKE '%' || trim(f.j->>'buscar') || '%'
        OR coalesce(p.observacion, '') ILIKE '%' || trim(f.j->>'buscar') || '%'
      )
      AND (
        f.j->>'sellado' IS NULL OR trim(f.j->>'sellado') = ''
        OR p.sellado = (f.j->>'sellado')::boolean
      )
      AND (
        f.j->>'abs_desde' IS NULL OR trim(f.j->>'abs_desde') = ''
        OR (
          public.ppto_abs_a_numeric(p.abs_inicio) IS NOT NULL
          AND public.ppto_abs_a_numeric(p.abs_final) IS NOT NULL
          AND public.ppto_abs_a_numeric(p.abs_final) >= (f.j->>'abs_desde')::numeric
        )
      )
      AND (
        f.j->>'abs_hasta' IS NULL OR trim(f.j->>'abs_hasta') = ''
        OR (
          public.ppto_abs_a_numeric(p.abs_inicio) IS NOT NULL
          AND public.ppto_abs_a_numeric(p.abs_final) IS NOT NULL
          AND public.ppto_abs_a_numeric(p.abs_inicio) <= (f.j->>'abs_hasta')::numeric
        )
      )
      AND (
        f.j->>'vlr_unitario_desde' IS NULL OR trim(f.j->>'vlr_unitario_desde') = ''
        OR coalesce(p.vlr_unitario, 0) >= (f.j->>'vlr_unitario_desde')::numeric
      )
      AND (
        f.j->>'vlr_unitario_hasta' IS NULL OR trim(f.j->>'vlr_unitario_hasta') = ''
        OR coalesce(p.vlr_unitario, 0) <= (f.j->>'vlr_unitario_hasta')::numeric
      )
      AND (
        f.j->>'cant_total_desde' IS NULL OR trim(f.j->>'cant_total_desde') = ''
        OR coalesce(p.cant_total, 0) >= (f.j->>'cant_total_desde')::numeric
      )
      AND (
        f.j->>'cant_total_hasta' IS NULL OR trim(f.j->>'cant_total_hasta') = ''
        OR coalesce(p.cant_total, 0) <= (f.j->>'cant_total_hasta')::numeric
      )
      AND (
        f.j->>'costo_directo_desde' IS NULL OR trim(f.j->>'costo_directo_desde') = ''
        OR coalesce(p.costo_directo, 0) >= (f.j->>'costo_directo_desde')::numeric
      )
      AND (
        f.j->>'costo_directo_hasta' IS NULL OR trim(f.j->>'costo_directo_hasta') = ''
        OR coalesce(p.costo_directo, 0) <= (f.j->>'costo_directo_hasta')::numeric
      )
    GROUP BY
      p.capitulo,
      CASE WHEN lower(trim(coalesce(p_nivel, 'capitulo'))) = 'item' THEN p.item ELSE NULL END,
      coalesce(nullif(trim(coalesce(p.revisado, '')), ''), 'No Revisado')
  ),
  por_grupo AS (
    SELECT
      coalesce(nullif(trim(capitulo), ''), '(sin capítulo)') AS capitulo,
      item,
      max(descripcion) AS descripcion,
      max(und) AS und,
      coalesce(sum(cant_total), 0)::numeric AS cant_total,
      coalesce(sum(registros), 0)::bigint AS total_registros,
      coalesce(sum(costo_directo), 0)::numeric AS total_costo,
      jsonb_object_agg(
        estado_norm,
        jsonb_build_object(
          'registros', registros,
          'costo_directo', round(costo_directo::numeric, 2),
          'cant_total', round(cant_total::numeric, 4)
        )
      ) AS por_estado
    FROM base
    GROUP BY
      coalesce(nullif(trim(capitulo), ''), '(sin capítulo)'),
      item
  ),
  tot AS (
    SELECT coalesce(sum(total_registros), 0)::bigint AS total_registros FROM por_grupo
  )
  SELECT jsonb_build_object(
    'nivel', lower(trim(coalesce(p_nivel, 'capitulo'))),
    'capitulo', nullif(trim(coalesce(p_capitulo, '')), ''),
    'total_registros', (SELECT total_registros FROM tot),
    'grupos', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'capitulo', g.capitulo,
            'item', g.item,
            'descripcion', coalesce(g.descripcion, ''),
            'und', coalesce(g.und, ''),
            'cant_total', round(g.cant_total::numeric, 4),
            'total_registros', g.total_registros,
            'total_costo', round(g.total_costo::numeric, 2),
            'por_estado', g.por_estado
          )
          ORDER BY g.capitulo, g.item NULLS FIRST
        )
        FROM por_grupo g
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.presupuesto_panel_validacion_interv IS
  'Agregado por capítulo o ítem y estado Interventoría para panel dinámico (sin paginar filas).';

GRANT EXECUTE ON FUNCTION public.ppto_abs_a_numeric(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ppto_abs_a_numeric(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.presupuesto_panel_validacion_interv TO authenticated;
GRANT EXECUTE ON FUNCTION public.presupuesto_panel_validacion_interv TO service_role;
