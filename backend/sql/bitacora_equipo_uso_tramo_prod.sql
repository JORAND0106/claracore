-- =============================================================================
-- PRODUCCIÓN — Bitácora Maquinaria: columnas faltantes `tramo` y `operador_rrhh_id`
-- =============================================================================
-- Evidencia (PostgREST prod, 2026-09-24):
--   SELECT id,tramo FROM seguimiento_bitacora_equipo_uso
--     → 42703: column seguimiento_bitacora_equipo_uso.tramo does not exist
--   SELECT id,operador_rrhh_id FROM seguimiento_bitacora_equipo_uso
--     → 42703: column ...operador_rrhh_id does not exist
--
-- Personal / Materiales: el tramo por fila vive DENTRO de JSONB
--   (`asistencia_colaboradores` / `materiales` en seguimiento_bitacora_entrada).
--   No requieren ADD COLUMN. La columna `tramo` a nivel documento en
--   `seguimiento_bitacora_entrada` SÍ existe (SELECT tramo → HTTP 200).
--
-- Origen del script de repo:
--   backend/migrations/20260922150000_bitacora_tramo_por_fila.sql
--   (esa migración nunca se aplicó en producción para estas dos columnas).
--
-- Seguridad:
--   - Solo ADD COLUMN IF NOT EXISTS (nullable, sin DEFAULT que reescriue filas).
--   - No DROP, no DELETE, no UPDATE de datos de negocio.
--   - Idempotente: se puede re-ejecutar sin daño.
--
-- NOTA: este bloque NO incluye el DROP INDEX del script original
--   (uq_seg_bitacora_diario_contrato_fecha_tramo) — eso es otro cambio de
--   consolidación; aquí solo se corrige la causa del 400 de Maquinaria.
-- =============================================================================

BEGIN;

ALTER TABLE public.seguimiento_bitacora_equipo_uso
  ADD COLUMN IF NOT EXISTS tramo text;

ALTER TABLE public.seguimiento_bitacora_equipo_uso
  ADD COLUMN IF NOT EXISTS operador_rrhh_id bigint;

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.tramo IS
  'Tramo del contrato (maestro PK) asignado a esta fila de maquinaria. Obligatorio en UI.';

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.operador_rrhh_id IS
  'FK lógica a RRHH trabajador del operador (autocompletado).';

COMMIT;

-- =============================================================================
-- Verificación (ejecutar DESPUÉS del COMMIT; debe devolver 2 filas):
-- =============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'seguimiento_bitacora_equipo_uso'
--   AND column_name IN ('tramo', 'operador_rrhh_id')
-- ORDER BY column_name;
--
-- Esperado:
--   operador_rrhh_id | bigint | YES
--   tramo            | text   | YES
--
-- Tras aplicar en Supabase SQL Editor: Project Settings → API →
--   «Reload schema» / Notificar a PostgREST (si el error 42703 persiste
--   unos segundos por caché de esquema).
-- =============================================================================
