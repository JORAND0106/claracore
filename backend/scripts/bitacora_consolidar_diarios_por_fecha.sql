-- =============================================================================
-- Protocolo de seguridad — consolidar Reportes Diarios multi-tramo → 1 por fecha
-- =============================================================================
-- NO ejecutar el bloque de consolidación (PASO 3) hasta:
--   1) Backup creado y verificado (PASO 1)
--   2) Vista previa SELECT revisada (PASO 2)
--   3) Aprobación explícita del usuario sobre esa vista previa
--
-- Objetivo:
--   Varios diarios (contrato_id, fecha, tramo distinto) → un solo diario por
--   (contrato_id, fecha). Cada fila de asistencia / materiales / equipos_uso /
--   recibe el `tramo` del reporte de origen. Eventos e imágenes se concatenan.
--   El keeper es el de menor id; los demás se eliminan tras migrar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASO 1 — BACKUPS (obligatorio antes de cualquier UPDATE/DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_seg_bitacora_entrada_consol_20260922 AS
SELECT e.*, now() AS backed_up_at
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
  AND (e.contrato_id, e.fecha) IN (
    SELECT contrato_id, fecha
    FROM public.seguimiento_bitacora_entrada
    WHERE tipo = 'diario'
    GROUP BY contrato_id, fecha
    HAVING count(*) > 1
  );

CREATE TABLE IF NOT EXISTS public._bak_seg_bitacora_equipo_uso_consol_20260922 AS
SELECT u.*, now() AS backed_up_at
FROM public.seguimiento_bitacora_equipo_uso u
WHERE u.entrada_id IN (
  SELECT id FROM public._bak_seg_bitacora_entrada_consol_20260922
);

-- Verificar backups
SELECT 'entradas_bak' AS kind, count(*) AS n FROM public._bak_seg_bitacora_entrada_consol_20260922
UNION ALL
SELECT 'usos_bak', count(*) FROM public._bak_seg_bitacora_equipo_uso_consol_20260922;

-- ---------------------------------------------------------------------------
-- PASO 2 — VISTA PREVIA (SELECT) — revisar y aprobar antes de consolidar
-- ---------------------------------------------------------------------------

-- 2a) Grupos a consolidar
SELECT
  e.contrato_id,
  e.fecha,
  count(*) AS n_diarios,
  array_agg(e.id ORDER BY e.id) AS entrada_ids,
  array_agg(COALESCE(e.tramo, '<NULL>') ORDER BY e.id) AS tramos,
  array_agg(e.estado ORDER BY e.id) AS estados,
  min(e.id) AS keeper_id,
  sum(jsonb_array_length(COALESCE(e.asistencia_colaboradores, '[]'::jsonb))) AS n_asistencia_total,
  sum(jsonb_array_length(COALESCE(e.materiales, '[]'::jsonb))) AS n_materiales_total,
  sum(jsonb_array_length(COALESCE(e.personal, '[]'::jsonb))) AS n_personal_total,
  sum(jsonb_array_length(COALESCE(e.eventos, '[]'::jsonb))) AS n_eventos_total,
  sum(jsonb_array_length(COALESCE(e.imagenes, '[]'::jsonb))) AS n_imagenes_total
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
GROUP BY e.contrato_id, e.fecha
HAVING count(*) > 1
ORDER BY e.contrato_id, e.fecha;

-- 2b) Detalle por entrada (filas de origen → tramo que se estampará)
SELECT
  e.id,
  e.contrato_id,
  e.fecha,
  e.tramo AS tramo_documento_origen,
  e.estado,
  jsonb_array_length(COALESCE(e.asistencia_colaboradores, '[]'::jsonb)) AS n_asistencia,
  jsonb_array_length(COALESCE(e.materiales, '[]'::jsonb)) AS n_materiales,
  jsonb_array_length(COALESCE(e.eventos, '[]'::jsonb)) AS n_eventos,
  jsonb_array_length(COALESCE(e.imagenes, '[]'::jsonb)) AS n_imagenes,
  (
    SELECT count(*) FROM public.seguimiento_bitacora_equipo_uso u
    WHERE u.entrada_id = e.id
  ) AS n_equipos_uso,
  CASE WHEN e.id = (
    SELECT min(e2.id) FROM public.seguimiento_bitacora_entrada e2
    WHERE e2.tipo = 'diario' AND e2.contrato_id = e.contrato_id AND e2.fecha = e.fecha
  ) THEN 'KEEPER' ELSE 'MERGE→DELETE' END AS rol
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
  AND (e.contrato_id, e.fecha) IN (
    SELECT contrato_id, fecha
    FROM public.seguimiento_bitacora_entrada
    WHERE tipo = 'diario'
    GROUP BY contrato_id, fecha
    HAVING count(*) > 1
  )
ORDER BY e.contrato_id, e.fecha, e.id;

-- 2c) Preview de cómo quedarían filas de asistencia con tramo estampado
SELECT
  e.contrato_id,
  e.fecha,
  e.id AS entrada_origen_id,
  e.tramo AS tramo_a_asignar,
  elem->>'nombre' AS colaborador,
  elem->>'cargo' AS cargo,
  COALESCE(elem->>'tramo', e.tramo) AS tramo_fila_resultante
FROM public.seguimiento_bitacora_entrada e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.asistencia_colaboradores, '[]'::jsonb)) AS elem
WHERE e.tipo = 'diario'
  AND (e.contrato_id, e.fecha) IN (
    SELECT contrato_id, fecha
    FROM public.seguimiento_bitacora_entrada
    WHERE tipo = 'diario'
    GROUP BY contrato_id, fecha
    HAVING count(*) > 1
  )
ORDER BY e.contrato_id, e.fecha, e.id;

-- ---------------------------------------------------------------------------
-- PASO 3 — CONSOLIDACIÓN (SOLO tras aprobación explícita del usuario)
-- Descomentar el bloque DO $$ … $$ completo tras aprobación.
-- ---------------------------------------------------------------------------
/*
DO $$
DECLARE
  r RECORD;
  keeper_id bigint;
  other_id bigint;
  other_tramo text;
  other_ids bigint[];
  i int;
  asist jsonb;
  mats jsonb;
  pers jsonb;
  evs jsonb;
  imgs jsonb;
  keep_asist jsonb;
  keep_mats jsonb;
  keep_pers jsonb;
  keep_evs jsonb;
  keep_imgs jsonb;
  stamped jsonb;
  elem jsonb;
  arr jsonb;
BEGIN
  FOR r IN
    SELECT contrato_id, fecha, array_agg(id ORDER BY id) AS ids
    FROM public.seguimiento_bitacora_entrada
    WHERE tipo = 'diario'
    GROUP BY contrato_id, fecha
    HAVING count(*) > 1
  LOOP
    keeper_id := r.ids[1];
    other_ids := r.ids[2:array_length(r.ids, 1)];

    SELECT COALESCE(asistencia_colaboradores, '[]'::jsonb),
           COALESCE(materiales, '[]'::jsonb),
           COALESCE(personal, '[]'::jsonb),
           COALESCE(eventos, '[]'::jsonb),
           COALESCE(imagenes, '[]'::jsonb)
      INTO keep_asist, keep_mats, keep_pers, keep_evs, keep_imgs
    FROM public.seguimiento_bitacora_entrada WHERE id = keeper_id;

    -- Estampar tramo del keeper en sus propias filas si aún no lo tienen
    SELECT tramo INTO other_tramo FROM public.seguimiento_bitacora_entrada WHERE id = keeper_id;
    IF other_tramo IS NOT NULL AND btrim(other_tramo) <> '' THEN
      arr := '[]'::jsonb;
      FOR elem IN SELECT * FROM jsonb_array_elements(keep_asist)
      LOOP
        IF coalesce(elem->>'tramo', '') = '' THEN
          elem := elem || jsonb_build_object('tramo', other_tramo);
        END IF;
        arr := arr || jsonb_build_array(elem);
      END LOOP;
      keep_asist := arr;

      arr := '[]'::jsonb;
      FOR elem IN SELECT * FROM jsonb_array_elements(keep_mats)
      LOOP
        IF coalesce(elem->>'tramo', '') = '' THEN
          elem := elem || jsonb_build_object('tramo', other_tramo);
        END IF;
        arr := arr || jsonb_build_array(elem);
      END LOOP;
      keep_mats := arr;

      UPDATE public.seguimiento_bitacora_equipo_uso
      SET tramo = COALESCE(NULLIF(btrim(tramo), ''), other_tramo)
      WHERE entrada_id = keeper_id AND (tramo IS NULL OR btrim(tramo) = '');
    END IF;

    FOREACH other_id IN ARRAY other_ids
    LOOP
      SELECT tramo,
             COALESCE(asistencia_colaboradores, '[]'::jsonb),
             COALESCE(materiales, '[]'::jsonb),
             COALESCE(personal, '[]'::jsonb),
             COALESCE(eventos, '[]'::jsonb),
             COALESCE(imagenes, '[]'::jsonb)
        INTO other_tramo, asist, mats, pers, evs, imgs
      FROM public.seguimiento_bitacora_entrada WHERE id = other_id;

      -- Asistencia con tramo de origen
      stamped := '[]'::jsonb;
      FOR elem IN SELECT * FROM jsonb_array_elements(asist)
      LOOP
        IF coalesce(elem->>'tramo', '') = '' AND other_tramo IS NOT NULL THEN
          elem := elem || jsonb_build_object('tramo', other_tramo);
        END IF;
        stamped := stamped || jsonb_build_array(elem);
      END LOOP;
      keep_asist := keep_asist || stamped;

      -- Materiales con tramo de origen
      stamped := '[]'::jsonb;
      FOR elem IN SELECT * FROM jsonb_array_elements(mats)
      LOOP
        IF coalesce(elem->>'tramo', '') = '' AND other_tramo IS NOT NULL THEN
          elem := elem || jsonb_build_object('tramo', other_tramo);
        END IF;
        stamped := stamped || jsonb_build_array(elem);
      END LOOP;
      keep_mats := keep_mats || stamped;

      keep_pers := keep_pers || pers;
      keep_evs := keep_evs || evs;
      keep_imgs := keep_imgs || imgs;

      -- Equipos: reasignar al keeper + estampar tramo
      UPDATE public.seguimiento_bitacora_equipo_uso
      SET entrada_id = keeper_id,
          tramo = COALESCE(NULLIF(btrim(tramo), ''), other_tramo)
      WHERE entrada_id = other_id;

      DELETE FROM public.seguimiento_bitacora_entrada WHERE id = other_id;
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
  END LOOP;
END $$;

-- Tras consolidación exitosa: restaurar unicidad un diario por fecha
CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_diario_contrato_fecha
  ON public.seguimiento_bitacora_entrada (contrato_id, fecha)
  WHERE tipo = 'diario';
*/

-- ---------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN post-consolidación (tras ejecutar PASO 3)
-- ---------------------------------------------------------------------------
-- Debe devolver 0 filas:
-- SELECT contrato_id, fecha, count(*) AS n
-- FROM public.seguimiento_bitacora_entrada
-- WHERE tipo = 'diario'
-- GROUP BY contrato_id, fecha
-- HAVING count(*) > 1;

-- Conteos vs backup (asistencia + materiales + usos):
-- SELECT
--   (SELECT count(*) FROM public._bak_seg_bitacora_entrada_consol_20260922) AS entradas_bak,
--   (SELECT count(*) FROM public.seguimiento_bitacora_entrada e
--    WHERE e.tipo='diario' AND (e.contrato_id, e.fecha) IN (
--      SELECT DISTINCT contrato_id, fecha FROM public._bak_seg_bitacora_entrada_consol_20260922
--    )) AS entradas_after;
