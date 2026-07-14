-- Relleno opcional: copiar PK/ubicación desde solicitud a entradas cuya cabecera quedó sin pk_id.
-- Ejecutar solo si se desea normalizar datos históricos; Salidas ya resuelve PK vía solicitud/OC.

UPDATE public.almacen_entrada e
SET
  pk_id = COALESCE(NULLIF(TRIM(e.pk_id), ''), si.pk_id),
  tramo = COALESCE(NULLIF(TRIM(e.tramo), ''), si.tramo),
  costado = COALESCE(NULLIF(TRIM(e.costado), ''), si.costado),
  abscisa_inicial = COALESCE(NULLIF(TRIM(e.abscisa_inicial), ''), si.abscisa_inicial::text),
  abscisa_final = COALESCE(NULLIF(TRIM(e.abscisa_final), ''), si.abscisa_final::text)
FROM public.almacen_entrada_item ei
JOIN public.almacen_orden_compra_item oci ON oci.id = ei.orden_compra_item_id
JOIN public.almacen_solicitud_item si ON si.id = oci.solicitud_item_id
WHERE ei.entrada_id = e.id
  AND si.pk_id IS NOT NULL
  AND (e.pk_id IS NULL OR TRIM(e.pk_id) = '');

NOTIFY pgrst, 'reload schema';
