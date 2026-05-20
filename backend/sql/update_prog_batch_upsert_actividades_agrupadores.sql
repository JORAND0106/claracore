-- Programación de Obra — RPC batch con soporte agrupador WBS
-- REVISAR antes de ejecutar en Supabase.
--
-- Cambios respecto a la versión anterior:
--   - INSERT/UPDATE en prog_actividades incluye agrupador_id y codigo_wbs
--   - Permite usar la RPC también para filas de agrupador (2.A, 2.C, …)
--
-- Prerequisitos:
--   - alter_prog_actividades_agrupadores.sql ya ejecutado
--   - Función prog_batch_upsert_actividades existente (Fase 1)

CREATE OR REPLACE FUNCTION public.prog_batch_upsert_actividades(
    p_version_id   uuid,
    p_contrato_id  bigint,
    p_pk_id        text,
    p_usuario_id   bigint,
    p_actividades  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pk              text        := trim(p_pk_id);
    v_now             timestamptz := now();
    v_items_total     int;
    v_items_con_fecha int;
    v_estado          text;
    v_result          jsonb;
BEGIN

    -- ─────────────────────────────────────────────────────────────
    -- 1. Upsert masivo en prog_actividades (incluye agrupador WBS)
    -- ─────────────────────────────────────────────────────────────
    INSERT INTO public.prog_actividades (
        version_id, contrato_id, pk_id, capitulo, item, segmento,
        fecha_inicio, duracion_dias_habiles, fecha_fin_calculada,
        cantidad_programada, unidad, costo_unitario, tipo_distribucion,
        heredado_de_capitulo, override_manual,
        agrupador_id, codigo_wbs,
        creado_por, actualizado_en
    )
    SELECT
        p_version_id,
        p_contrato_id,
        v_pk,
        trim(a->>'capitulo'),
        trim(a->>'item'),
        COALESCE((a->>'segmento')::int, 1),
        NULLIF(trim(a->>'fecha_inicio'), '')::date,
        NULLIF(a->>'duracion_dias_habiles', '')::int,
        NULLIF(trim(a->>'fecha_fin_calculada'), '')::date,
        (a->>'cantidad_programada')::numeric,
        left(COALESCE(trim(a->>'unidad'), '?'), 20),
        COALESCE((a->>'costo_unitario')::numeric, 0),
        COALESCE(NULLIF(trim(a->>'tipo_distribucion'), ''), 'lineal'),
        COALESCE((a->>'heredado_de_capitulo')::boolean, false),
        COALESCE((a->>'override_manual')::boolean, false),
        NULLIF(a->>'agrupador_id', '')::bigint,
        NULLIF(trim(a->>'codigo_wbs'), ''),
        p_usuario_id,
        v_now
    FROM jsonb_array_elements(p_actividades) AS a
    ON CONFLICT (version_id, pk_id, capitulo, item, segmento)
    DO UPDATE SET
        fecha_inicio             = EXCLUDED.fecha_inicio,
        duracion_dias_habiles    = EXCLUDED.duracion_dias_habiles,
        fecha_fin_calculada      = EXCLUDED.fecha_fin_calculada,
        cantidad_programada      = EXCLUDED.cantidad_programada,
        unidad                   = EXCLUDED.unidad,
        costo_unitario           = EXCLUDED.costo_unitario,
        tipo_distribucion        = EXCLUDED.tipo_distribucion,
        heredado_de_capitulo     = EXCLUDED.heredado_de_capitulo,
        override_manual          = EXCLUDED.override_manual,
        agrupador_id             = EXCLUDED.agrupador_id,
        codigo_wbs               = EXCLUDED.codigo_wbs,
        actualizado_en           = EXCLUDED.actualizado_en;

    -- ─────────────────────────────────────────────────────────────
    -- 2. Sync prog_actividades_capitulo
    -- ─────────────────────────────────────────────────────────────
    WITH cap_ranges AS (
        SELECT
            capitulo,
            MIN(fecha_inicio)        AS min_fi,
            MAX(fecha_fin_calculada) AS max_ff
        FROM public.prog_actividades
        WHERE version_id = p_version_id
          AND pk_id       = v_pk
          AND fecha_inicio        IS NOT NULL
          AND fecha_fin_calculada IS NOT NULL
        GROUP BY capitulo
    ),
    cap_dias AS (
        SELECT
            cr.capitulo,
            cr.min_fi,
            cr.max_ff,
            (
                SELECT COUNT(*)::int
                FROM generate_series(
                    cr.min_fi::timestamp,
                    cr.max_ff::timestamp - INTERVAL '1 day',
                    INTERVAL '1 day'
                ) AS gs(d)
                WHERE EXTRACT(DOW FROM gs.d) NOT IN (0, 6)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.prog_calendario_no_habiles nh
                      WHERE nh.fecha = gs.d::date
                        AND (nh.contrato_id = p_contrato_id OR nh.contrato_id IS NULL)
                  )
            ) AS dias
        FROM cap_ranges cr
        WHERE cr.max_ff >= cr.min_fi
    )
    INSERT INTO public.prog_actividades_capitulo (
        version_id, contrato_id, pk_id, capitulo,
        fecha_inicio_sugerida, duracion_dias_habiles,
        aplica_herencia, creado_por, actualizado_en
    )
    SELECT
        p_version_id,
        p_contrato_id,
        v_pk,
        cd.capitulo,
        cd.min_fi,
        cd.dias,
        false,
        p_usuario_id,
        v_now
    FROM cap_dias cd
    WHERE cd.dias > 0
    ON CONFLICT (version_id, pk_id, capitulo)
    DO UPDATE SET
        fecha_inicio_sugerida  = EXCLUDED.fecha_inicio_sugerida,
        duracion_dias_habiles  = EXCLUDED.duracion_dias_habiles,
        aplica_herencia        = false,
        actualizado_en         = EXCLUDED.actualizado_en;

    -- ─────────────────────────────────────────────────────────────
    -- 3. Upsert prog_pk_estado
    -- ─────────────────────────────────────────────────────────────
    SELECT COUNT(DISTINCT (capitulo, item))::int
    INTO v_items_total
    FROM public.presupuesto
    WHERE contrato_id    = p_contrato_id
      AND pk_id          = v_pk
      AND tipo_ejecucion = 'Presupuesto de Obra'
      AND dado_de_baja   = false;

    SELECT COUNT(DISTINCT (capitulo, item))::int
    INTO v_items_con_fecha
    FROM public.prog_actividades
    WHERE version_id   = p_version_id
      AND pk_id        = v_pk
      AND fecha_inicio IS NOT NULL;

    v_estado := CASE
        WHEN v_items_total     <= 0             THEN 'sin_cantidad'
        WHEN v_items_con_fecha <= 0             THEN 'sin_iniciar'
        WHEN v_items_con_fecha >= v_items_total THEN 'completa'
        ELSE                                         'en_progreso'
    END;

    INSERT INTO public.prog_pk_estado (
        version_id, contrato_id, pk_id,
        estado_programacion, items_total, items_con_fecha, actualizado_en
    ) VALUES (
        p_version_id,
        p_contrato_id,
        v_pk,
        v_estado,
        v_items_total,
        LEAST(v_items_con_fecha, v_items_total),
        v_now
    )
    ON CONFLICT (version_id, pk_id)
    DO UPDATE SET
        estado_programacion = EXCLUDED.estado_programacion,
        items_total         = EXCLUDED.items_total,
        items_con_fecha     = EXCLUDED.items_con_fecha,
        actualizado_en      = EXCLUDED.actualizado_en;

    -- ─────────────────────────────────────────────────────────────
    -- 4. Respuesta para el frontend
    -- ─────────────────────────────────────────────────────────────
    SELECT jsonb_build_object(
        'ok',                  true,
        'estado_programacion', v_estado,
        'items_total',         v_items_total,
        'items_con_fecha',     v_items_con_fecha,
        'actividades', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'capitulo',            capitulo,
                'item',                item,
                'segmento',            segmento,
                'id',                  id,
                'fecha_fin_calculada', fecha_fin_calculada,
                'agrupador_id',        agrupador_id,
                'codigo_wbs',          codigo_wbs
            ) ORDER BY capitulo, item, segmento), '[]'::jsonb)
            FROM public.prog_actividades
            WHERE version_id = p_version_id
              AND pk_id       = v_pk
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.prog_batch_upsert_actividades(uuid, bigint, text, bigint, jsonb) IS
  'Batch upsert de prog_actividades (ítems y agrupadores WBS), sync capítulos y prog_pk_estado en una transacción.';
