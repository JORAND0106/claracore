-- Diagnóstico y recuperación de asignaciones de subcontratista reemplazadas
-- por el fallback legado_exclusivo (antes de la corrección de no-reemplazo).
--
-- Ejecutar en Supabase SQL editor o psql. Revisar resultados antes de UPDATE.
-- Nota: en algunos entornos logs.detalle es text; se castea a jsonb donde hace falta.

-- 1) Operaciones legado_exclusivo / bulk-subcontratista en logs.
--    Columnas reales: modulo, entidad_tipo, entidad_id (no existe "entidad").
SELECT
  id,
  created_at,
  usuario_id,
  usuario_nombre,
  accion,
  modulo,
  entidad_tipo,
  entidad_id,
  detalle,
  valor_anterior,
  valor_nuevo
FROM public.logs
WHERE modulo = 'PRESUPUESTO'
  AND (
    entidad_tipo IN (
      'presupuesto_bulk_subcontratista',
      'presupuesto_sub_redistribucion',
      'presupuesto'
    )
    OR detalle::text ILIKE '%legado_exclusivo%'
    OR detalle::text ILIKE '%legado_libre%'
    OR detalle::text ILIKE '%presupuesto_bulk_subcontratista%'
    OR (
      detalle IS NOT NULL
      AND detalle::text <> ''
      AND (detalle::jsonb ->> 'mode') IN (
        'legado_exclusivo',
        'legado_libre',
        'simple',
        'redistribuir'
      )
    )
  )
ORDER BY created_at DESC
LIMIT 200;

-- 2) Registros de presupuesto cuyo FK subcontratista_id no coincide con
--    ninguna fila en presupuesto_sub_asignacion (posible sobrescritura).
SELECT
  p.id AS presupuesto_id,
  p.contrato_id,
  p.item,
  p.tramo,
  p.pk_id,
  p.cant_total,
  p.subcontratista_id AS fk_actual,
  s.razon_social AS fk_razon,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'subcontratista_id', a.subcontratista_id,
      'cantidad', a.cantidad,
      'saldado', a.saldado
    ))
    FROM public.presupuesto_sub_asignacion a
    WHERE a.presupuesto_id = p.id
  ) AS asignaciones
FROM public.presupuesto p
LEFT JOIN public.subcontratistas s ON s.id = p.subcontratista_id
WHERE p.dado_de_baja IS NOT TRUE
  AND p.subcontratista_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.presupuesto_sub_asignacion a
    WHERE a.presupuesto_id = p.id
      AND a.subcontratista_id = p.subcontratista_id
  )
ORDER BY p.contrato_id, p.id
LIMIT 500;

-- 3) Historial de redistribuciones (para reconstrucción).
SELECT
  id,
  created_at,
  contrato_id,
  usuario_id,
  nuevo_subcontratista_id,
  proporciones,
  decisiones,
  detalle
FROM public.presupuesto_sub_redistribucion
ORDER BY created_at DESC
LIMIT 100;

-- 4) Candidatos a restauración: filas en asignacion de un sub A mientras el FK
--    apunta a B (compartido mal sincronizado o reemplazo parcial).
SELECT
  a.presupuesto_id,
  a.contrato_id,
  a.subcontratista_id AS sub_en_asignacion,
  a.cantidad,
  p.subcontratista_id AS fk_presupuesto,
  p.item,
  p.tramo,
  p.cant_total
FROM public.presupuesto_sub_asignacion a
JOIN public.presupuesto p ON p.id = a.presupuesto_id
WHERE p.subcontratista_id IS NOT NULL
  AND p.subcontratista_id <> a.subcontratista_id
  AND NOT EXISTS (
    SELECT 1 FROM public.presupuesto_sub_asignacion a2
    WHERE a2.presupuesto_id = a.presupuesto_id
      AND a2.subcontratista_id = p.subcontratista_id
  )
ORDER BY a.contrato_id, a.presupuesto_id
LIMIT 500;

-- 5) Backfill seguro: si el FK tiene sub y no hay fila en asignacion, recrearla
--    con cant_total (NO ejecuta cambios; descomentar para aplicar).
-- INSERT INTO public.presupuesto_sub_asignacion (
--   contrato_id, presupuesto_id, subcontratista_id, cantidad
-- )
-- SELECT
--   p.contrato_id, p.id, p.subcontratista_id, COALESCE(p.cant_total, 0)
-- FROM public.presupuesto p
-- WHERE p.subcontratista_id IS NOT NULL
--   AND COALESCE(p.dado_de_baja, false) = false
--   AND NOT EXISTS (
--     SELECT 1 FROM public.presupuesto_sub_asignacion a
--     WHERE a.presupuesto_id = p.id AND a.subcontratista_id = p.subcontratista_id
--   )
-- ON CONFLICT (presupuesto_id, subcontratista_id) DO NOTHING;
