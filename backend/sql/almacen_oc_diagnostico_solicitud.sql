-- Diagnóstico SOLO LECTURA — solicitud 17
-- En Supabase SQL Editor: ejecute CADA bloque por separado (uno → Run → siguiente).
-- Si una columna no existe en su base, ese bloque fallará; use el siguiente.

-- ===== BLOQUE A: ¿sigue el UNIQUE que bloquea 2 OC? =====
SELECT con.conname AS nombre, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'almacen_orden_compra'
  AND con.contype = 'u'
ORDER BY 1;

-- ===== BLOQUE B: OC de la solicitud 17 =====
SELECT id, solicitud_id, numero_oc, estado, proveedor_id, proveedor_nombre, created_at
FROM public.almacen_orden_compra
WHERE solicitud_id = 17
ORDER BY id;

-- ===== BLOQUE C: líneas de esas OC =====
SELECT
  oc.id AS orden_compra_id,
  oc.numero_oc,
  oc.proveedor_nombre AS oc_proveedor,
  oci.id AS oc_item_id,
  oci.solicitud_item_id,
  oci.material_descripcion,
  oci.cantidad,
  oci.valor_unitario
FROM public.almacen_orden_compra oc
JOIN public.almacen_orden_compra_item oci ON oci.orden_compra_id = oc.id
WHERE oc.solicitud_id = 17
ORDER BY oc.id, oci.id;

-- ===== BLOQUE D: ítems de la solicitud y si ya están en OC =====
SELECT
  si.id AS solicitud_item_id,
  si.numero_linea,
  si.estado_validacion,
  si.insumo_id,
  oci.orden_compra_id,
  oc.numero_oc
FROM public.almacen_solicitud_item si
LEFT JOIN public.almacen_orden_compra_item oci ON oci.solicitud_item_id = si.id
LEFT JOIN public.almacen_orden_compra oc ON oc.id = oci.orden_compra_id
WHERE si.solicitud_id = 17
ORDER BY si.numero_linea, oc.id;

-- ===== BLOQUE E: estado de la solicitud =====
SELECT id, contrato_id, consecutivo, estado, created_at
FROM public.almacen_solicitud
WHERE id = 17;
