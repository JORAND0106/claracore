-- =============================================================================
-- Planillas de Tubería × SICOE Obra — UNA consulta de solo lectura
-- =============================================================================
-- Qué hace (en lenguaje claro):
--   Para cada planilla YA SELLADA (cerrada, validada o con N2 Aprobado) que
--   tenga un reporte SICOE asociado, compara línea por línea:
--     1) la cantidad guardada en el snapshot de la planilla al sellar,
--     2) la cantidad actual del registro en el reporte SICOE,
--     3) la diferencia (snapshot − SICOE).
--
--   Incluye líneas del Resumen (netos) y los descuentos de Roca/Otros
--   (DESC_ALT_* o DESC_VOL_*) que vengan en el snapshot.
--
-- Cómo empareja:
--   Por nombre de ítem (sin mayúsculas/minúsculas ni espacios de más).
--   Solo mira registros del reporte vinculado a esa planilla.
--
-- NO modifica nada. Solo SELECT.
-- Ejecutar en el SQL Editor de Supabase.
-- =============================================================================

WITH planillas_selladas AS (
  SELECT
    p.id AS planilla_id,
    p.contrato_id,
    p.nombre AS planilla_nombre,
    p.estado,
    p.nivel2_estado,
    p.cerrado_at,
    p.meta_cabecera,
    p.calculo_snapshot,
    COALESCE(
      p.meta_cabecera->>'motor_calculo_version',
      p.calculo_snapshot->>'motor_calculo_version',
      CASE
        WHEN p.cerrado_at IS NOT NULL
             AND p.cerrado_at < TIMESTAMPTZ '2026-10-05 02:25:23+00'
          THEN 'altura_v1'
        ELSE 'volumen_v1'
      END
    ) AS motor_inferido
  FROM topo_planillas_tuberia p
  WHERE
    lower(COALESCE(p.estado, '')) IN ('cerrado', 'validado')
    OR COALESCE(p.nivel2_estado, '') = 'Aprobado'
),
links AS (
  SELECT
    ps.planilla_id,
    ps.contrato_id,
    ps.planilla_nombre,
    ps.estado,
    ps.cerrado_at,
    ps.motor_inferido,
    ps.calculo_snapshot,
    (link_elem->>'reporte_id')::bigint AS reporte_id,
    NULLIF(trim(link_elem->>'numero_reporte'), '') AS numero_reporte
  FROM planillas_selladas ps
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(ps.meta_cabecera->'sicoe_reportes') = 'array'
        THEN ps.meta_cabecera->'sicoe_reportes'
      ELSE '[]'::jsonb
    END
  ) AS link_elem
  WHERE NULLIF(trim(link_elem->>'reporte_id'), '') IS NOT NULL
),
lineas_snapshot AS (
  -- Resumen de Cantidades (netos): cantidad = neto
  SELECT
    l.planilla_id,
    l.contrato_id,
    l.planilla_nombre,
    l.estado,
    l.cerrado_at,
    l.motor_inferido,
    l.reporte_id,
    l.numero_reporte,
    'cantidades'::text AS origen,
    upper(trim(n->>'codigo')) AS codigo,
    coalesce(nullif(trim(n->>'nombre'), ''), upper(trim(n->>'codigo'))) AS nombre,
    (n->>'neto')::numeric AS cantidad_snapshot
  FROM links l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(l.calculo_snapshot->'netos') = 'array'
        THEN l.calculo_snapshot->'netos'
      ELSE '[]'::jsonb
    END
  ) AS n
  WHERE nullif(trim(n->>'codigo'), '') IS NOT NULL

  UNION ALL

  -- Descuentos Roca/Otros del snapshot (altura o volumen)
  SELECT
    l.planilla_id,
    l.contrato_id,
    l.planilla_nombre,
    l.estado,
    l.cerrado_at,
    l.motor_inferido,
    l.reporte_id,
    l.numero_reporte,
    'descuentos'::text AS origen,
    upper(trim(d->>'codigo')) AS codigo,
    coalesce(nullif(trim(d->>'nombre'), ''), upper(trim(d->>'codigo'))) AS nombre,
    -- En SICOE el descuento suele ir negativo; comparamos por valor absoluto abajo.
    (d->>'cantidad')::numeric AS cantidad_snapshot
  FROM links l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(l.calculo_snapshot->'descuentos_altura_detalle') = 'array'
           AND jsonb_array_length(l.calculo_snapshot->'descuentos_altura_detalle') > 0
        THEN l.calculo_snapshot->'descuentos_altura_detalle'
      WHEN jsonb_typeof(l.calculo_snapshot->'descuentos_volumen_detalle') = 'array'
        THEN l.calculo_snapshot->'descuentos_volumen_detalle'
      ELSE '[]'::jsonb
    END
  ) AS d
  WHERE nullif(trim(d->>'codigo'), '') IS NOT NULL
),
regs AS (
  SELECT
    r.contrato_id,
    r.reporte_id,
    r.id AS registro_id,
    r.numero_registro,
    r.nombre AS registro_nombre,
    r.cantidad_total,
    -- Sellado al nivel máximo habitual de interventoría / validación SICOE.
    (
      coalesce(r.nivel3_estado, '') IN ('Aprobado', 'aprobado', 'APROBADO')
      OR coalesce(r.sellado, false) = true
    ) AS registro_sellado
  FROM so_registros r
  WHERE r.reporte_id IN (SELECT DISTINCT reporte_id FROM links)
)
SELECT
  ls.contrato_id,
  ls.planilla_id,
  ls.planilla_nombre,
  ls.estado AS planilla_estado,
  ls.cerrado_at,
  ls.motor_inferido,
  ls.reporte_id,
  ls.numero_reporte,
  ls.origen,
  ls.codigo AS codigo_snapshot,
  ls.nombre AS nombre_linea,
  ls.cantidad_snapshot,
  rg.numero_registro,
  rg.cantidad_total AS cantidad_sicoe,
  rg.registro_sellado,
  round(ls.cantidad_snapshot - coalesce(rg.cantidad_total, 0), 4) AS diferencia_cruda,
  round(abs(ls.cantidad_snapshot) - abs(coalesce(rg.cantidad_total, 0)), 4) AS diferencia_abs,
  CASE
    WHEN rg.registro_id IS NULL THEN 'sin_match_en_reporte'
    WHEN abs(abs(ls.cantidad_snapshot) - abs(coalesce(rg.cantidad_total, 0))) <= 0.02
      THEN 'coincide'
    ELSE 'difiere'
  END AS resultado
FROM lineas_snapshot ls
LEFT JOIN regs rg
  ON rg.contrato_id = ls.contrato_id
 AND rg.reporte_id = ls.reporte_id
 AND lower(regexp_replace(coalesce(rg.registro_nombre, ''), '\s+', ' ', 'g'))
   = lower(regexp_replace(coalesce(ls.nombre, ''), '\s+', ' ', 'g'))
ORDER BY
  ls.contrato_id,
  ls.planilla_nombre,
  ls.reporte_id,
  ls.origen,
  ls.codigo;
