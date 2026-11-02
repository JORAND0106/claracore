-- Solo lectura: entradas que ya superan su OC y salidas que ya superan lo recibido.
-- No modifica datos. Ejecutar manualmente cuando se necesite el informe.

-- 1) Ítems de entrada vs saldo de la línea de OC (recibido acumulado en OC vs cantidad OC).
--    Diferencia = exceso de recepción sobre la cantidad contratada en esa línea.
SELECT
  e.contrato_id,
  e.codigo AS codigo_entrada,
  e.id AS entrada_id,
  oc.numero_oc,
  oci.id AS orden_compra_item_id,
  oci.material_descripcion,
  oci.unidad,
  oci.cantidad AS cantidad_oc,
  oci.cantidad_recibida AS recibido_acumulado_oc,
  ei.cantidad_recibida AS cantidad_esta_entrada,
  GREATEST(0::numeric, COALESCE(oci.cantidad_recibida, 0) - COALESCE(oci.cantidad, 0)) AS exceso_sobre_oc
FROM public.almacen_entrada_item ei
JOIN public.almacen_entrada e ON e.id = ei.entrada_id
JOIN public.almacen_orden_compra_item oci ON oci.id = ei.orden_compra_item_id
JOIN public.almacen_orden_compra oc ON oc.id = e.orden_compra_id
WHERE COALESCE(oci.cantidad_recibida, 0) > COALESCE(oci.cantidad, 0) + 0.0001
ORDER BY e.contrato_id, e.codigo, oci.id;

-- 2) Salidas cuya cantidad supera lo recibido neto en la línea de entrada
--    (recibido − (otras salidas − devoluciones) no se calcula aquí línea a línea;
--     se reporta salida vs recibido de la línea y despacho neto si existe).
SELECT
  s.contrato_id,
  s.codigo AS codigo_salida,
  s.id AS salida_id,
  e.codigo AS codigo_entrada,
  ei.id AS entrada_item_id,
  ei.cantidad_recibida,
  s.cantidad_salida,
  GREATEST(0::numeric, COALESCE(s.cantidad_salida, 0) - COALESCE(ei.cantidad_recibida, 0)) AS exceso_bruto_vs_recibido
FROM public.almacen_salida s
JOIN public.almacen_entrada_item ei ON ei.id = s.entrada_item_id
JOIN public.almacen_entrada e ON e.id = ei.entrada_id
WHERE COALESCE(s.cantidad_salida, 0) > COALESCE(ei.cantidad_recibida, 0) + 0.0001
ORDER BY s.contrato_id, s.codigo;
