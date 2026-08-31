-- Auditoría: cambios de Ítem potencialmente hechos sin permiso «Editar»
-- (asignar-item / EDITAR registro con item_numero en campos_modificados).
-- Ejecutar en Supabase/SQL cuando haya acceso a producción.
--
-- 1) Asignaciones de ítem (acción ASIGNAR_ITEM) por usuarios cuyo cargo
--    en el contrato NO tiene editar en «Reporte de Cantidades»:

/*
WITH logs_item AS (
  SELECT
    l.id,
    l.created_at,
    l.usuario_id,
    l.usuario_nombre,
    l.contrato_id,
    l.entidad_id AS registro_id,
    l.detalle->>'item_numero' AS item_nuevo,
    l.valor_anterior->>'item_numero' AS item_anterior,
    l.valor_nuevo->>'item_numero' AS item_actual_snap,
    l.accion
  FROM logs l
  WHERE l.modulo = 'SICOE'
    AND l.entidad = 'registro'
    AND l.accion IN ('ASIGNAR_ITEM', 'EDITAR')
    AND (
      l.accion = 'ASIGNAR_ITEM'
      OR (l.detalle::text ILIKE '%item_numero%')
    )
    AND l.created_at >= NOW() - INTERVAL '90 days'
)
SELECT *
FROM logs_item
ORDER BY created_at DESC;
*/

-- Nota: cruzar usuario_id con matriz permisos (cargo + contrato) donde
-- crear=true AND editar=false para marcar sospechosos. Sin acceso a BD
-- en el agente cloud, este SQL queda como procedimiento operativo.
