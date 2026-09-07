-- =============================================================================
-- Protocolo de seguridad — corregir «Tramo 0» / «0» en Bitácora (Reporte Diario)
-- =============================================================================
-- NO ejecutar el UPDATE hasta:
--   1) Backup creado
--   2) Vista previa SELECT revisada
--   3) Aprobación explícita del usuario
--
-- Alcance: solo columna `tramo` → NULL. No modifica cuerpo ni otros campos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASO 1 — BACKUP (obligatorio antes de cualquier UPDATE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_seg_bitacora_tramo_cero_20260907 AS
SELECT
  id,
  contrato_id,
  tipo,
  fecha,
  tramo,
  created_at,
  updated_at,
  now() AS backed_up_at
FROM public.seguimiento_bitacora_entrada
WHERE tipo = 'diario'
  AND tramo IS NOT NULL
  AND (
    btrim(tramo) ~ '^[0]+$'
    OR btrim(tramo) ~* '^tramo[[:space:]_-]*0+$'
  );

-- Verificar backup
-- SELECT count(*) FROM public._bak_seg_bitacora_tramo_cero_20260907;

-- ---------------------------------------------------------------------------
-- PASO 2 — VISTA PREVIA (SELECT) — revisar y aprobar antes del UPDATE
-- ---------------------------------------------------------------------------
SELECT
  e.id,
  e.contrato_id,
  e.fecha,
  e.tramo AS tramo_actual,
  e.elaborado_por_user_id,
  e.created_at,
  e.updated_at
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
  AND e.tramo IS NOT NULL
  AND (
    btrim(e.tramo) ~ '^[0]+$'
    OR btrim(e.tramo) ~* '^tramo[[:space:]_-]*0+$'
  )
ORDER BY e.contrato_id, e.fecha, e.id;

-- Conteos por contrato
SELECT
  e.contrato_id,
  count(*) AS filas_tramo_cero
FROM public.seguimiento_bitacora_entrada e
WHERE e.tipo = 'diario'
  AND e.tramo IS NOT NULL
  AND (
    btrim(e.tramo) ~ '^[0]+$'
    OR btrim(e.tramo) ~* '^tramo[[:space:]_-]*0+$'
  )
GROUP BY e.contrato_id
ORDER BY e.contrato_id;

-- ---------------------------------------------------------------------------
-- PASO 3 — UPDATE (SOLO tras aprobación del usuario)
-- Descomentar y ejecutar tras aprobación:
-- ---------------------------------------------------------------------------
/*
UPDATE public.seguimiento_bitacora_entrada e
SET
  tramo = NULL,
  updated_at = now()
WHERE e.tipo = 'diario'
  AND e.tramo IS NOT NULL
  AND (
    btrim(e.tramo) ~ '^[0]+$'
    OR btrim(e.tramo) ~* '^tramo[[:space:]_-]*0+$'
  );
*/

-- ---------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN post-UPDATE
-- ---------------------------------------------------------------------------
-- Debe devolver 0 filas:
-- SELECT id, contrato_id, fecha, tramo
-- FROM public.seguimiento_bitacora_entrada
-- WHERE tipo = 'diario'
--   AND tramo IS NOT NULL
--   AND (
--     btrim(tramo) ~ '^[0]+$'
--     OR btrim(tramo) ~* '^tramo[[:space:]_-]*0+$'
--   );

-- Opcional: catálogo pk_ids con tramo sentinel (solo diagnóstico; no se altera aquí)
-- SELECT DISTINCT contrato_id, tramo
-- FROM public.pk_ids
-- WHERE tramo IS NOT NULL
--   AND (
--     btrim(tramo) ~ '^[0]+$'
--     OR btrim(tramo) ~* '^tramo[[:space:]_-]*0+$'
--   )
-- ORDER BY 1, 2;
