-- Diagnóstico SOLO LECTURA: posibles entradas duplicadas.
-- No modifica datos. Ejecutar en Supabase SQL Editor / psql.
-- Tolerancia de saldo usada en la app: 0.0001 en cantidad.

-- 1) Misma remisión + mismo proveedor (por id)
SELECT
  e.contrato_id,
  upper(btrim(e.numero_documento)) AS remision,
  e.proveedor_id,
  p.razon_social AS proveedor,
  count(*) AS n,
  array_agg(COALESCE(e.codigo, e.numero_entrada::text) ORDER BY e.id) AS codigos,
  array_agg(e.id ORDER BY e.id) AS entrada_ids,
  min(e.created_at) AS primera,
  max(e.created_at) AS ultima
FROM public.almacen_entrada e
LEFT JOIN public.almacen_proveedor p ON p.id = e.proveedor_id
WHERE e.tipo = 'recibo'
  AND nullif(btrim(e.numero_documento), '') IS NOT NULL
  AND e.proveedor_id IS NOT NULL
GROUP BY 1, 2, 3, 4
HAVING count(*) > 1
ORDER BY n DESC, e.contrato_id;

-- 2) Misma remisión + mismo proveedor (por nombre, sin id)
SELECT
  e.contrato_id,
  upper(btrim(e.numero_documento)) AS remision,
  lower(btrim(e.proveedor_nombre_texto)) AS proveedor_nombre,
  count(*) AS n,
  array_agg(COALESCE(e.codigo, e.numero_entrada::text) ORDER BY e.id) AS codigos,
  array_agg(e.id ORDER BY e.id) AS entrada_ids
FROM public.almacen_entrada e
WHERE e.tipo = 'recibo'
  AND nullif(btrim(e.numero_documento), '') IS NOT NULL
  AND e.proveedor_id IS NULL
  AND nullif(btrim(e.proveedor_nombre_texto), '') IS NOT NULL
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY n DESC;

-- 3) Soportes con el mismo content_hash (si la tabla existe)
SELECT
  h.contrato_id,
  h.content_hash,
  h.tipo_soporte,
  count(*) AS n,
  array_agg(DISTINCT h.codigo_entrada) AS codigos,
  array_agg(DISTINCT h.entrada_id) AS entrada_ids
FROM public.almacen_entrada_soporte_hash h
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY n DESC;
