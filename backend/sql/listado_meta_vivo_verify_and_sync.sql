-- ============================================================================
-- Listado meta en vivo — verificación SELECT + sync opcional de copias
-- ============================================================================
-- Ejecutar DESPUÉS de 20260805160000_listado_meta_vivo_backup.sql
-- 1) Revisar los SELECT de verificación
-- 2) Solo entonces descomentar / ejecutar el bloque SYNC
-- Requiere funciones _dash_norm_capitulo_key / _dash_norm_item_key
-- ============================================================================

-- ── VERIFICACIÓN: mismatches presupuesto vs listado ─────────────────────────
SELECT p.contrato_id,
       COUNT(*) AS filas_mismatch,
       COUNT(*) FILTER (
         WHERE COALESCE(p.descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
       ) AS mismatch_descripcion,
       COUNT(*) FILTER (
         WHERE COALESCE(p.und, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
       ) AS mismatch_unidad,
       COUNT(*) FILTER (
         WHERE COALESCE(p.item, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
       ) AS mismatch_item
FROM public.presupuesto p
JOIN public.listado_precios lp
  ON lp.contrato_id = p.contrato_id
 AND public._dash_norm_capitulo_key(lp.capitulo)
     = public._dash_norm_capitulo_key(p.capitulo)
 AND public._dash_norm_item_key(lp.item_numero)
     = public._dash_norm_item_key(p.item)
WHERE COALESCE(p.dado_de_baja, FALSE) = FALSE
  AND (
    COALESCE(p.descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
    OR COALESCE(p.und, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
    OR COALESCE(p.item, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
  )
GROUP BY p.contrato_id
ORDER BY p.contrato_id;

-- ── VERIFICACIÓN: mismatches so_registros vs listado ────────────────────────
SELECT r.contrato_id,
       COUNT(*) AS filas_mismatch,
       COUNT(DISTINCT r.acta_rpo_id) FILTER (WHERE r.acta_rpo_id IS NOT NULL) AS actas_rpo_distintas,
       COUNT(DISTINCT r.reporte_id) FILTER (WHERE r.reporte_id IS NOT NULL) AS reportes_distintos
FROM public.so_registros r
JOIN public.listado_precios lp
  ON lp.contrato_id = r.contrato_id
 AND public._dash_norm_capitulo_key(lp.capitulo)
     = public._dash_norm_capitulo_key(r.capitulo)
 AND public._dash_norm_item_key(lp.item_numero)
     = public._dash_norm_item_key(r.item_numero)
WHERE (
    COALESCE(r.item_descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
    OR COALESCE(r.unidad, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
    OR COALESCE(r.item_numero, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
  )
GROUP BY r.contrato_id
ORDER BY r.contrato_id;

-- ── VERIFICACIÓN: reportes/actas RPO afectados (muestra) ─────────────────────
SELECT a.contrato_id,
       a.id AS acta_id,
       a.numero_rpo,
       COUNT(DISTINCT r.id) AS registros,
       COUNT(DISTINCT r.reporte_id) AS reportes
FROM public.so_registros r
JOIN public.listado_precios lp
  ON lp.contrato_id = r.contrato_id
 AND public._dash_norm_capitulo_key(lp.capitulo)
     = public._dash_norm_capitulo_key(r.capitulo)
 AND public._dash_norm_item_key(lp.item_numero)
     = public._dash_norm_item_key(r.item_numero)
JOIN public.actas a ON a.id = r.acta_rpo_id
WHERE (
    COALESCE(r.item_descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
    OR COALESCE(r.unidad, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
    OR COALESCE(r.item_numero, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
  )
GROUP BY a.contrato_id, a.id, a.numero_rpo
ORDER BY a.contrato_id, a.numero_rpo
LIMIT 200;

-- ============================================================================
-- SYNC (opcional): alinear copias al listado. La app ya resuelve en vivo;
-- este paso reduce divergencia en rutas que lean columnas almacenadas.
-- Descomentar tras revisar los SELECT anteriores.
-- ============================================================================
/*
UPDATE public.presupuesto p
SET
  item = lp.item_numero,
  descripcion = lp.descripcion,
  und = lp.unidad
FROM public.listado_precios lp
WHERE lp.contrato_id = p.contrato_id
  AND public._dash_norm_capitulo_key(lp.capitulo)
      = public._dash_norm_capitulo_key(p.capitulo)
  AND public._dash_norm_item_key(lp.item_numero)
      = public._dash_norm_item_key(p.item)
  AND (
    COALESCE(p.descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
    OR COALESCE(p.und, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
    OR COALESCE(p.item, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
  );

UPDATE public.so_registros r
SET
  item_numero = lp.item_numero,
  item_descripcion = lp.descripcion,
  unidad = lp.unidad
FROM public.listado_precios lp
WHERE lp.contrato_id = r.contrato_id
  AND public._dash_norm_capitulo_key(lp.capitulo)
      = public._dash_norm_capitulo_key(r.capitulo)
  AND public._dash_norm_item_key(lp.item_numero)
      = public._dash_norm_item_key(r.item_numero)
  AND (
    COALESCE(r.item_descripcion, '') IS DISTINCT FROM COALESCE(lp.descripcion, '')
    OR COALESCE(r.unidad, '') IS DISTINCT FROM COALESCE(lp.unidad, '')
    OR COALESCE(r.item_numero, '') IS DISTINCT FROM COALESCE(lp.item_numero, '')
  );
*/
