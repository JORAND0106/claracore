-- Diagnóstico de OC por solicitud (p. ej. id = 17).
-- Solo lectura. No modifica datos.
-- Cambie :solicitud_id o reemplace 17 en las consultas.

-- 1) Restricciones / índices únicos actuales sobre almacen_orden_compra
SELECT
  con.conname AS nombre,
  con.contype AS tipo,
  pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'almacen_orden_compra'
  AND con.contype IN ('u', 'p')
ORDER BY con.conname;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'almacen_orden_compra'
ORDER BY indexname;

-- 2) Encabezados de OC de la solicitud
SELECT
  oc.id,
  oc.solicitud_id,
  oc.numero_oc,
  oc.estado,
  oc.proveedor_id,
  oc.proveedor_nombre,
  oc.documento_sistema,
  oc.envio_estado,
  oc.envio_correo,
  oc.aprobada_por,
  oc.created_at
FROM public.almacen_orden_compra oc
WHERE oc.solicitud_id = 17
ORDER BY oc.id;

-- 3) Líneas de cada OC (material, cantidad, vínculo a ítem de solicitud)
SELECT
  oc.id AS orden_compra_id,
  oc.numero_oc,
  oc.proveedor_id AS oc_proveedor_id,
  oc.proveedor_nombre AS oc_proveedor_nombre,
  oci.id AS oc_item_id,
  oci.solicitud_item_id,
  oci.proveedor_nombre AS linea_proveedor,
  oci.material_descripcion,
  oci.unidad,
  oci.cantidad,
  oci.valor_unitario,
  si.numero_linea,
  si.estado_validacion,
  si.insumo_id,
  si.proveedor_seleccionado_id,
  si.proveedor_seleccionado_nombre
FROM public.almacen_orden_compra oc
JOIN public.almacen_orden_compra_item oci ON oci.orden_compra_id = oc.id
LEFT JOIN public.almacen_solicitud_item si ON si.id = oci.solicitud_item_id
WHERE oc.solicitud_id = 17
ORDER BY oc.id, oci.id;

-- 4) Ítems de la solicitud: ¿cuáles ya están en alguna OC?
SELECT
  si.id AS solicitud_item_id,
  si.numero_linea,
  si.estado_validacion,
  si.insumo_id,
  si.proveedor_seleccionado_id,
  si.proveedor_seleccionado_nombre,
  oci.orden_compra_id,
  oc.numero_oc,
  oc.proveedor_nombre AS oc_proveedor
FROM public.almacen_solicitud_item si
LEFT JOIN public.almacen_orden_compra_item oci ON oci.solicitud_item_id = si.id
LEFT JOIN public.almacen_orden_compra oc ON oc.id = oci.orden_compra_id
WHERE si.solicitud_id = 17
ORDER BY si.numero_linea, oc.id;

-- 5) Solicitud: estado y consecutivo
SELECT id, contrato_id, consecutivo, estado, created_at, validada_at
FROM public.almacen_solicitud
WHERE id = 17;

-- 6) Duplicados que impedirían el índice único (toda la tabla)
SELECT solicitud_id, proveedor_id, count(*) AS n
FROM public.almacen_orden_compra
WHERE proveedor_id IS NOT NULL
GROUP BY solicitud_id, proveedor_id
HAVING count(*) > 1;

SELECT solicitud_id, lower(trim(proveedor_nombre)) AS proveedor_nombre, count(*) AS n
FROM public.almacen_orden_compra
WHERE proveedor_id IS NULL
  AND proveedor_nombre IS NOT NULL
  AND trim(proveedor_nombre) <> ''
GROUP BY solicitud_id, lower(trim(proveedor_nombre))
HAVING count(*) > 1;
