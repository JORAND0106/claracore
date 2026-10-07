-- =============================================================================
-- Solo lectura — Planillas ABIERTAS con reporte: posibles descuentos duplicados
-- =============================================================================
-- Qué hace:
--   Lista planillas en borrador (no selladas) que ya tienen reporte SICOE y
--   muestra, por reporte, cuántos registros parecen descuento de altura
--   (nombre/obs con "altura") y de volumen (nombre/obs con "volumen" / DESC_VOL).
--   Sirve para detectar si la sync con el método nuevo dejó pares contradictorios.
--
-- NO modifica nada. No ejecutar acciones a partir de esto sin revisión humana.
-- =============================================================================

SELECT
  p.contrato_id,
  p.id AS planilla_id,
  p.nombre AS planilla_nombre,
  p.estado,
  (link_elem->>'reporte_id')::bigint AS reporte_id,
  NULLIF(trim(link_elem->>'numero_reporte'), '') AS numero_reporte,
  count(*) FILTER (
    WHERE r.nombre ILIKE '%altura%'
       OR coalesce(r.observacion, '') ILIKE '%altura%'
       OR coalesce(r.nombre, '') ILIKE 'Desc. altura%'
  ) AS regs_parecen_desc_altura,
  count(*) FILTER (
    WHERE r.nombre ILIKE '%volumen%'
       OR coalesce(r.observacion, '') ILIKE '%volumen%'
       OR coalesce(r.nombre, '') ILIKE 'Desc. volumen%'
  ) AS regs_parecen_desc_volumen,
  count(*) AS total_registros_reporte
FROM topo_planillas_tuberia p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(p.meta_cabecera->'sicoe_reportes') = 'array'
      THEN p.meta_cabecera->'sicoe_reportes'
    ELSE '[]'::jsonb
  END
) AS link_elem
LEFT JOIN so_registros r
  ON r.contrato_id = p.contrato_id
 AND r.reporte_id = (link_elem->>'reporte_id')::bigint
WHERE lower(COALESCE(p.estado, '')) = 'borrador'
  AND COALESCE(p.nivel2_estado, '') IS DISTINCT FROM 'Aprobado'
  AND NULLIF(trim(link_elem->>'reporte_id'), '') IS NOT NULL
GROUP BY
  p.contrato_id, p.id, p.nombre, p.estado,
  (link_elem->>'reporte_id')::bigint,
  NULLIF(trim(link_elem->>'numero_reporte'), '')
HAVING
  count(*) FILTER (
    WHERE r.nombre ILIKE '%altura%'
       OR coalesce(r.observacion, '') ILIKE '%altura%'
       OR coalesce(r.nombre, '') ILIKE 'Desc. altura%'
  ) > 0
  AND count(*) FILTER (
    WHERE r.nombre ILIKE '%volumen%'
       OR coalesce(r.observacion, '') ILIKE '%volumen%'
       OR coalesce(r.nombre, '') ILIKE 'Desc. volumen%'
  ) > 0
ORDER BY p.contrato_id, p.nombre;
