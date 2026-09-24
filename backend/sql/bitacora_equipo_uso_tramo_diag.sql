-- =============================================================================
-- SOLO LECTURA — Diagnóstico: ¿existe tramo / operador_rrhh_id en Maquinaria?
-- Ejecutar en Supabase SQL Editor (producción) ANTES y DESPUÉS de la migración.
-- =============================================================================

-- 1) Columnas de Maquinaria (tabla hija)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'seguimiento_bitacora_equipo_uso'
  AND column_name IN ('tramo', 'operador_rrhh_id', 'equipo_nombre', 'horas_intermedias')
ORDER BY column_name;

-- 2) Columna tramo a nivel documento (legado) en entrada — debe existir
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'seguimiento_bitacora_entrada'
  AND column_name IN ('tramo', 'asistencia_colaboradores', 'materiales', 'personal')
ORDER BY column_name;

-- 3) Resumen booleano rápido
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seguimiento_bitacora_equipo_uso'
      AND column_name = 'tramo'
  ) AS equipo_uso_tiene_tramo,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seguimiento_bitacora_equipo_uso'
      AND column_name = 'operador_rrhh_id'
  ) AS equipo_uso_tiene_operador_rrhh_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seguimiento_bitacora_entrada'
      AND column_name = 'tramo'
  ) AS entrada_tiene_tramo_documento;
