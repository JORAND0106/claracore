-- ============================================================
-- PASO 1: DIAGNÓSTICO
-- Cuántos registros tienen N3=Aprobado sin N2=Aprobado (inconsistencia grave)
-- ============================================================
SELECT
  COUNT(*)                                          AS total_inconsistentes,
  SUM(COALESCE(costo_directo,0))::bigint            AS costo_total_inconsistente,
  COUNT(*) FILTER (WHERE nivel2_estado IS NULL OR nivel2_estado = '' OR nivel2_estado = 'No Revisado')
                                                    AS sin_n2,
  COUNT(*) FILTER (WHERE nivel2_estado = 'Pendiente') AS n2_pendiente,
  COUNT(*) FILTER (WHERE nivel2_estado = 'Rechazado') AS n2_rechazado
FROM public.so_registros
WHERE nivel3_estado = 'Aprobado'
  AND COALESCE(nivel2_estado,'') <> 'Aprobado';

-- ============================================================
-- PASO 2: DIAGNÓSTICO detallado por contrato
-- ============================================================
SELECT
  contrato_id,
  COUNT(*)                               AS registros_inconsistentes,
  SUM(COALESCE(costo_directo,0))::bigint AS costo_inconsistente,
  nivel2_estado
FROM public.so_registros
WHERE nivel3_estado = 'Aprobado'
  AND COALESCE(nivel2_estado,'') <> 'Aprobado'
GROUP BY contrato_id, nivel2_estado
ORDER BY costo_inconsistente DESC;

-- ============================================================
-- PASO 3: VER los registros problemáticos (muestra los primeros 100)
-- ============================================================
SELECT
  id, contrato_id, reporte_id, numero_registro, item_numero,
  costo_directo,
  nivel1_estado, nivel2_estado, nivel3_estado,
  nivel3_fecha, nivel3_usuario_id
FROM public.so_registros
WHERE nivel3_estado = 'Aprobado'
  AND COALESCE(nivel2_estado,'') <> 'Aprobado'
ORDER BY costo_directo DESC NULLS LAST
LIMIT 100;

-- ============================================================
-- PASO 4: REPARACIÓN
-- Opción A: Propagar la aprobación hacia atrás
-- (Solo si los registros YA fueron aprobados por Interventoría y tiene sentido
--  que N1 y N2 también estuvieran aprobados — p.ej. migración de datos históricos)
-- EJECUTAR SOLO DESPUÉS DE REVISAR EL DIAGNÓSTICO ANTERIOR
-- ============================================================
/*
UPDATE public.so_registros
SET
  nivel1_estado = CASE WHEN COALESCE(nivel1_estado,'') <> 'Aprobado' THEN 'Aprobado' ELSE nivel1_estado END,
  nivel2_estado = CASE WHEN COALESCE(nivel2_estado,'') <> 'Aprobado' THEN 'Aprobado' ELSE nivel2_estado END
WHERE nivel3_estado = 'Aprobado'
  AND (COALESCE(nivel1_estado,'') <> 'Aprobado' OR COALESCE(nivel2_estado,'') <> 'Aprobado');
*/

-- ============================================================
-- PASO 5: PREVENCIÓN — Trigger que impide inconsistencias en el futuro
-- Bloquea cualquier UPDATE (directo o por API) que deje N3=Aprobado sin N2=Aprobado
-- o N2=Aprobado sin N1=Aprobado
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_check_validacion_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- N3 aprobado exige N2 aprobado
  IF NEW.nivel3_estado = 'Aprobado' AND COALESCE(NEW.nivel2_estado,'') <> 'Aprobado' THEN
    RAISE EXCEPTION
      'Integridad de cascada: nivel3_estado=Aprobado requiere nivel2_estado=Aprobado (registro id=%).',
      NEW.id;
  END IF;
  -- N2 aprobado exige N1 aprobado
  IF NEW.nivel2_estado = 'Aprobado' AND COALESCE(NEW.nivel1_estado,'') <> 'Aprobado' THEN
    RAISE EXCEPTION
      'Integridad de cascada: nivel2_estado=Aprobado requiere nivel1_estado=Aprobado (registro id=%).',
      NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Eliminar trigger anterior si existía
DROP TRIGGER IF EXISTS trg_validacion_cascade ON public.so_registros;

-- Crear trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trg_validacion_cascade
BEFORE INSERT OR UPDATE OF nivel1_estado, nivel2_estado, nivel3_estado
ON public.so_registros
FOR EACH ROW EXECUTE FUNCTION public.fn_check_validacion_cascade();

COMMENT ON FUNCTION public.fn_check_validacion_cascade() IS
  'Impide que nivel3=Aprobado sin nivel2=Aprobado, o nivel2=Aprobado sin nivel1=Aprobado. '
  'Garantiza integridad de cascada de validación en SICOE Obra incluso ante modificaciones directas en BD.';

-- ============================================================
-- PASO 6 (opcional): Verificar que el trigger funciona
-- Debe fallar con EXCEPTION si se intenta romper la cascada:
-- UPDATE public.so_registros SET nivel3_estado='Aprobado', nivel2_estado='No Revisado' WHERE id=<algún_id>;
-- ============================================================
