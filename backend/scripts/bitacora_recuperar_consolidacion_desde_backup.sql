-- =============================================================================
-- RECUPERACIÓN — re-consolidar Bitácora desde backup tras consolidación incompleta
-- =============================================================================
-- Caso: tras el PASO 3 original, el diario keeper quedó solo con datos de un
-- tramo (p.ej. 6 de 15 colaboradores; maquinaria incompleta).
--
-- Causa frecuente:
--   1) La consolidación SQL no aplicó bien todos los orígenes, O
--   2) Al abrir/guardar el reporte, `_normalizar_asistencia_colaboradores`
--      deduplicaba por persona SIN tramo y descartaba filas de otros tramos.
--
-- Este script RECONSTRUYE asistencia / materiales / eventos / imágenes /
-- equipos_uso del keeper a partir de:
--   public._bak_seg_bitacora_entrada_consol_20260922
--   public._bak_seg_bitacora_equipo_uso_consol_20260922
--
-- NO ejecutar el PASO 3 (UPDATE) hasta:
--   1) Verificar que existen las tablas de backup
--   2) Revisar la vista previa (PASO 2)
--   3) Aprobación explícita del usuario
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASO 0 — ¿Existe el backup?
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public._bak_seg_bitacora_entrada_consol_20260922) AS entradas_bak,
  (SELECT count(*) FROM public._bak_seg_bitacora_equipo_uso_consol_20260922) AS usos_bak;

-- ---------------------------------------------------------------------------
-- PASO 1 — Backup del estado ACTUAL (antes de re-aplicar)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_seg_bitacora_entrada_pre_recover_20260922 AS
SELECT e.*, now() AS backed_up_at
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
  AND (e.contrato_id, e.fecha) IN (
    SELECT DISTINCT contrato_id, fecha
    FROM public._bak_seg_bitacora_entrada_consol_20260922
  );

CREATE TABLE IF NOT EXISTS public._bak_seg_bitacora_equipo_uso_pre_recover_20260922 AS
SELECT u.*, now() AS backed_up_at
FROM public.seguimiento_bitacora_equipo_uso u
WHERE u.entrada_id IN (
  SELECT id FROM public.seguimiento_bitacora_entrada e
  WHERE e.tipo = 'diario'
    AND (e.contrato_id, e.fecha) IN (
      SELECT DISTINCT contrato_id, fecha
      FROM public._bak_seg_bitacora_entrada_consol_20260922
    )
);

-- ---------------------------------------------------------------------------
-- PASO 2 — VISTA PREVIA: backup vs keeper actual (revisar antes de UPDATE)
-- ---------------------------------------------------------------------------

-- 2a) Por (contrato, fecha, tramo de origen): cuántas filas había en el backup
SELECT
  b.contrato_id,
  b.fecha,
  COALESCE(b.tramo, '<NULL>') AS tramo_origen,
  b.id AS entrada_origen_id,
  jsonb_array_length(COALESCE(b.asistencia_colaboradores, '[]'::jsonb)) AS n_asist_bak,
  jsonb_array_length(COALESCE(b.materiales, '[]'::jsonb)) AS n_mat_bak,
  (
    SELECT count(*) FROM public._bak_seg_bitacora_equipo_uso_consol_20260922 u
    WHERE u.entrada_id = b.id
  ) AS n_usos_bak
FROM public._bak_seg_bitacora_entrada_consol_20260922 b
ORDER BY b.contrato_id, b.fecha, b.id;

-- 2b) Totales esperados tras recuperación vs lo que hay hoy en el keeper
WITH bak AS (
  SELECT
    contrato_id,
    fecha,
    min(id) AS keeper_id_esperado,
    sum(jsonb_array_length(COALESCE(asistencia_colaboradores, '[]'::jsonb))) AS asist_bak_total,
    sum(jsonb_array_length(COALESCE(materiales, '[]'::jsonb))) AS mat_bak_total,
    count(*) AS n_entradas_bak
  FROM public._bak_seg_bitacora_entrada_consol_20260922
  GROUP BY contrato_id, fecha
),
usos_bak AS (
  SELECT
    b.contrato_id,
    b.fecha,
    count(*) AS usos_bak_total
  FROM public._bak_seg_bitacora_equipo_uso_consol_20260922 u
  JOIN public._bak_seg_bitacora_entrada_consol_20260922 b ON b.id = u.entrada_id
  GROUP BY b.contrato_id, b.fecha
),
keeper AS (
  SELECT
    e.contrato_id,
    e.fecha,
    e.id AS keeper_id_actual,
    jsonb_array_length(COALESCE(e.asistencia_colaboradores, '[]'::jsonb)) AS asist_actual,
    jsonb_array_length(COALESCE(e.materiales, '[]'::jsonb)) AS mat_actual,
    (
      SELECT count(*) FROM public.seguimiento_bitacora_equipo_uso u
      WHERE u.entrada_id = e.id
    ) AS usos_actual
  FROM public.seguimiento_bitacora_entrada e
  WHERE e.tipo = 'diario'
)
SELECT
  bak.contrato_id,
  bak.fecha,
  bak.n_entradas_bak,
  bak.keeper_id_esperado,
  k.keeper_id_actual,
  bak.asist_bak_total AS asist_esperada,
  k.asist_actual,
  bak.asist_bak_total - COALESCE(k.asist_actual, 0) AS asist_faltante,
  bak.mat_bak_total AS mat_esperada,
  k.mat_actual,
  COALESCE(ub.usos_bak_total, 0) AS usos_esperados,
  k.usos_actual,
  COALESCE(ub.usos_bak_total, 0) - COALESCE(k.usos_actual, 0) AS usos_faltantes
FROM bak
LEFT JOIN usos_bak ub USING (contrato_id, fecha)
LEFT JOIN keeper k
  ON k.contrato_id = bak.contrato_id
 AND k.fecha = bak.fecha
ORDER BY bak.contrato_id, bak.fecha;

-- 2c) Detalle de colaboradores en backup que deberían quedar (nombre + tramo)
SELECT
  b.contrato_id,
  b.fecha,
  b.id AS origen_id,
  COALESCE(b.tramo, '<NULL>') AS tramo_origen,
  elem->>'nombre' AS nombre,
  elem->>'cargo' AS cargo,
  COALESCE(NULLIF(elem->>'tramo', ''), b.tramo) AS tramo_fila_resultante
FROM public._bak_seg_bitacora_entrada_consol_20260922 b
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(b.asistencia_colaboradores, '[]'::jsonb)) = 'array'
      THEN COALESCE(b.asistencia_colaboradores, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
ORDER BY b.contrato_id, b.fecha, tramo_fila_resultante, nombre;

-- ---------------------------------------------------------------------------
-- PASO 3 — RECUPERACIÓN (SOLO tras aprobación explícita)
-- Descomentar el bloque DO $$ … $$ completo.
-- ---------------------------------------------------------------------------
/*
DO $$
DECLARE
  g RECORD;
  keeper_id bigint;
  b RECORD;
  keep_asist jsonb;
  keep_mats jsonb;
  keep_pers jsonb;
  keep_evs jsonb;
  keep_imgs jsonb;
  stamped jsonb;
  elem jsonb;
  src_tramo text;
  uso RECORD;
  next_orden int;
BEGIN
  FOR g IN
    SELECT contrato_id, fecha, min(id) AS keeper_from_bak
    FROM public._bak_seg_bitacora_entrada_consol_20260922
    GROUP BY contrato_id, fecha
  LOOP
    -- Keeper vivo: el diario actual de esa fecha (o el min id del backup si aún existiera)
    SELECT e.id INTO keeper_id
    FROM public.seguimiento_bitacora_entrada e
    WHERE e.tipo = 'diario'
      AND e.contrato_id = g.contrato_id
      AND e.fecha = g.fecha
    ORDER BY e.id
    LIMIT 1;

    IF keeper_id IS NULL THEN
      -- Recrear desde el registro keeper del backup
      INSERT INTO public.seguimiento_bitacora_entrada (
        contrato_id, tipo, fecha, tramo, estado,
        hora_inicio_labores, clima_codigo, clima_temp_c, clima_descripcion, clima_editado_manual,
        personal, asistencia_colaboradores, materiales, cuerpo_html, imagenes, eventos,
        created_by, created_by_nombre, created_by_rol, created_at, updated_at,
        cerrado_en, cierre_motivo
      )
      SELECT
        contrato_id, tipo, fecha, NULL, estado,
        hora_inicio_labores, clima_codigo, clima_temp_c, clima_descripcion, clima_editado_manual,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, COALESCE(cuerpo_html, ''), '[]'::jsonb, '[]'::jsonb,
        created_by, created_by_nombre, created_by_rol, created_at, now(),
        cerrado_en, cierre_motivo
      FROM public._bak_seg_bitacora_entrada_consol_20260922
      WHERE id = g.keeper_from_bak
      RETURNING id INTO keeper_id;
    END IF;

    keep_asist := '[]'::jsonb;
    keep_mats := '[]'::jsonb;
    keep_pers := '[]'::jsonb;
    keep_evs := '[]'::jsonb;
    keep_imgs := '[]'::jsonb;

    FOR b IN
      SELECT *
      FROM public._bak_seg_bitacora_entrada_consol_20260922
      WHERE contrato_id = g.contrato_id AND fecha = g.fecha
      ORDER BY id
    LOOP
      src_tramo := NULLIF(btrim(COALESCE(b.tramo, '')), '');

      -- Asistencia
      IF jsonb_typeof(COALESCE(b.asistencia_colaboradores, '[]'::jsonb)) = 'array' THEN
        stamped := '[]'::jsonb;
        FOR elem IN SELECT * FROM jsonb_array_elements(b.asistencia_colaboradores)
        LOOP
          IF coalesce(elem->>'tramo', '') = '' AND src_tramo IS NOT NULL THEN
            elem := elem || jsonb_build_object('tramo', src_tramo);
          END IF;
          stamped := stamped || jsonb_build_array(elem);
        END LOOP;
        keep_asist := keep_asist || stamped;
      END IF;

      -- Materiales
      IF jsonb_typeof(COALESCE(b.materiales, '[]'::jsonb)) = 'array' THEN
        stamped := '[]'::jsonb;
        FOR elem IN SELECT * FROM jsonb_array_elements(b.materiales)
        LOOP
          IF coalesce(elem->>'tramo', '') = '' AND src_tramo IS NOT NULL THEN
            elem := elem || jsonb_build_object('tramo', src_tramo);
          END IF;
          stamped := stamped || jsonb_build_array(elem);
        END LOOP;
        keep_mats := keep_mats || stamped;
      END IF;

      IF jsonb_typeof(COALESCE(b.personal, '[]'::jsonb)) = 'array' THEN
        keep_pers := keep_pers || b.personal;
      END IF;
      IF jsonb_typeof(COALESCE(b.eventos, '[]'::jsonb)) = 'array' THEN
        keep_evs := keep_evs || b.eventos;
      END IF;
      IF jsonb_typeof(COALESCE(b.imagenes, '[]'::jsonb)) = 'array' THEN
        keep_imgs := keep_imgs || b.imagenes;
      END IF;
    END LOOP;

    UPDATE public.seguimiento_bitacora_entrada
    SET asistencia_colaboradores = keep_asist,
        materiales = keep_mats,
        personal = keep_pers,
        eventos = keep_evs,
        imagenes = keep_imgs,
        tramo = NULL,
        updated_at = now()
    WHERE id = keeper_id;

    -- Equipos: reemplazar usos del keeper con la unión del backup
    DELETE FROM public.seguimiento_bitacora_equipo_uso WHERE entrada_id = keeper_id;
    next_orden := 0;
    FOR uso IN
      SELECT
        u.equipo_id,
        u.equipo_nombre,
        u.operador,
        u.cantidad,
        u.hora_inicio,
        u.hora_fin,
        u.horas_intermedias,
        u.created_at,
        b.tramo AS bak_tramo,
        u.entrada_id AS bak_entrada_id,
        u.id AS bak_uso_id
      FROM public._bak_seg_bitacora_equipo_uso_consol_20260922 u
      JOIN public._bak_seg_bitacora_entrada_consol_20260922 b ON b.id = u.entrada_id
      WHERE b.contrato_id = g.contrato_id AND b.fecha = g.fecha
      ORDER BY u.entrada_id, u.orden, u.id
    LOOP
      INSERT INTO public.seguimiento_bitacora_equipo_uso (
        entrada_id, equipo_id, equipo_nombre, operador,
        cantidad, hora_inicio, hora_fin, horas_intermedias, orden, created_at
      ) VALUES (
        keeper_id,
        uso.equipo_id,
        uso.equipo_nombre,
        uso.operador,
        COALESCE(uso.cantidad, 1),
        uso.hora_inicio,
        uso.hora_fin,
        COALESCE(uso.horas_intermedias, '[]'::jsonb),
        next_orden,
        COALESCE(uso.created_at, now())
      );
      -- Estampar tramo si la columna ya existe (migration tramo-por-fila).
      BEGIN
        UPDATE public.seguimiento_bitacora_equipo_uso
        SET tramo = NULLIF(btrim(COALESCE(uso.bak_tramo, '')), '')
        WHERE entrada_id = keeper_id AND orden = next_orden;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
      next_orden := next_orden + 1;
    END LOOP;
  END LOOP;
END $$;
*/

-- ---------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN (tras PASO 3)
-- ---------------------------------------------------------------------------
-- Repetir la query 2b: asist_faltante y usos_faltantes deben ser 0 (o ≤ 0).
--
-- SELECT
--   jsonb_array_length(COALESCE(asistencia_colaboradores,'[]'::jsonb)) AS n_asist,
--   (SELECT count(*) FROM seguimiento_bitacora_equipo_uso u WHERE u.entrada_id = e.id) AS n_usos
-- FROM seguimiento_bitacora_entrada e
-- WHERE tipo='diario' AND fecha = 'YYYY-MM-DD' AND contrato_id = ...;
