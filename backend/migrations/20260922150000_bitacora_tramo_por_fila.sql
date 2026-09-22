-- =============================================================================
-- Bitácora: Tramo por fila (Personal / Maquinaria / Materiales)
-- Reversión: un único Reporte Diario por (contrato_id, fecha).
-- =============================================================================
-- IMPORTANTE:
--   1) Este script DROPEA el índice único por tramo para permitir consolidación.
--   2) El índice único por (contrato, fecha) se crea en el script de consolidación
--      SOLO después de fusionar duplicados (ver
--      backend/scripts/bitacora_consolidar_diarios_por_fecha.sql).
--   3) No ejecuta UPDATE de datos de negocio aquí.
-- =============================================================================

-- Tramo a nivel de fila de maquinaria (tabla hija).
ALTER TABLE public.seguimiento_bitacora_equipo_uso
  ADD COLUMN IF NOT EXISTS tramo text;

ALTER TABLE public.seguimiento_bitacora_equipo_uso
  ADD COLUMN IF NOT EXISTS operador_rrhh_id bigint;

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.tramo IS
  'Tramo del contrato (maestro PK) asignado a esta fila de maquinaria. Obligatorio en UI.';

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.operador_rrhh_id IS
  'FK lógica a RRHH trabajador del operador (autocompletado).';

-- Quitar unicidad por tramo: permite consolidar varios diarios del mismo día.
DROP INDEX IF EXISTS public.uq_seg_bitacora_diario_contrato_fecha_tramo;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.tramo IS
  'LEGACY: tramo a nivel de documento. Tras consolidación queda NULL; el tramo vive por fila en personal/asistencia/materiales/equipos_uso.';
