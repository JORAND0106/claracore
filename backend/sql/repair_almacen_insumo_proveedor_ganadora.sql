-- Repara insumos con proveedor_id NULL usando el proveedor de la cotización ganadora
-- (match por razón social en almacen_proveedor del mismo contrato).
-- Ejecutar en el SQL editor de Supabase si no corre el endpoint de repair.

WITH ganadora AS (
  SELECT
    i.id AS insumo_id,
    i.contrato_id,
    i.codigo,
    NULLIF(TRIM(elem->>'proveedor'), '') AS proveedor_nombre,
    NULLIF(elem->>'proveedor_id', '')::bigint AS proveedor_id_detalle
  FROM almacen_insumo i
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(COALESCE(i.cotizaciones_detalle::jsonb, '[]'::jsonb)) = 'array'
      THEN COALESCE(i.cotizaciones_detalle::jsonb, '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  ) AS elem
  WHERE i.activo IS TRUE
    AND i.proveedor_id IS NULL
    AND COALESCE(elem->>'tipo', 'insumo') = 'insumo'
    AND COALESCE((elem->>'es_ganadora')::boolean, false) IS TRUE
),
matched AS (
  SELECT
    g.insumo_id,
    g.contrato_id,
    g.codigo,
    COALESCE(
      g.proveedor_id_detalle,
      p.id
    ) AS proveedor_id
  FROM ganadora g
  LEFT JOIN almacen_proveedor p
    ON p.contrato_id = g.contrato_id
   AND p.activo IS TRUE
   AND lower(trim(p.razon_social)) = lower(trim(g.proveedor_nombre))
  WHERE COALESCE(g.proveedor_id_detalle, p.id) IS NOT NULL
)
UPDATE almacen_insumo i
SET
  proveedor_id = m.proveedor_id,
  updated_at = now()
FROM matched m
WHERE i.id = m.insumo_id
  AND i.proveedor_id IS NULL
RETURNING i.id, i.codigo, i.proveedor_id;
