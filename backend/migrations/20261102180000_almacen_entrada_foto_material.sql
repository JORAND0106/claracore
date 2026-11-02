-- ClaraCore — Entradas: foto del material descargado + RPC de OC consolidadas

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS material_foto_blob_path text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS material_foto_nombre text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS material_foto_mime text;

COMMENT ON COLUMN public.almacen_entrada.material_foto_blob_path IS
  'Soporte fotográfico del material descargado (obligatorio en recibo tablet).';

COMMENT ON COLUMN public.almacen_entrada.material_foto_nombre IS
  'Nombre original del archivo de foto de material.';

COMMENT ON COLUMN public.almacen_entrada.material_foto_mime IS
  'MIME de la foto de material descargado.';

-- Una fila JSON por OC con insumos consolidados (saldo sumado por material).
CREATE OR REPLACE FUNCTION public.almacen_ocs_pendientes_tarjeta(p_contrato_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH ocs AS (
    SELECT
      oc.id,
      oc.numero_oc,
      oc.proveedor_id,
      oc.proveedor_nombre,
      oc.solicitud_id,
      oc.created_at
    FROM public.almacen_orden_compra oc
    WHERE oc.contrato_id = p_contrato_id
      AND oc.estado IS DISTINCT FROM 'anulada'
  ),
  items AS (
    SELECT
      oci.id AS orden_compra_item_id,
      oci.orden_compra_id,
      oci.solicitud_item_id,
      oci.material_descripcion,
      oci.unidad,
      GREATEST(0::numeric, COALESCE(oci.cantidad, 0) - COALESCE(oci.cantidad_recibida, 0)) AS saldo_cantidad,
      GREATEST(
        0::numeric,
        (COALESCE(oci.cantidad, 0) * COALESCE(oci.valor_unitario, 0))
          - COALESCE(oci.valor_recibido, 0)
      ) AS saldo_valor
    FROM public.almacen_orden_compra_item oci
    INNER JOIN ocs ON ocs.id = oci.orden_compra_id
  ),
  pending AS (
    SELECT *
    FROM items
    WHERE saldo_cantidad > 0.0001
      AND saldo_valor > 0.0000001
  ),
  sol_items AS (
    SELECT
      si.id,
      si.insumo_id,
      si.pk_id,
      si.tramo,
      si.costado,
      si.abscisa_inicial,
      si.abscisa_final,
      si.material_descripcion AS sol_material,
      si.unidad AS sol_unidad
    FROM public.almacen_solicitud_item si
    WHERE si.id IN (
      SELECT DISTINCT p.solicitud_item_id FROM pending p WHERE p.solicitud_item_id IS NOT NULL
    )
  ),
  enriched AS (
    SELECT
      p.orden_compra_item_id,
      p.orden_compra_id,
      p.saldo_cantidad,
      p.saldo_valor,
      COALESCE(si.insumo_id, NULL) AS insumo_id,
      COALESCE(
        NULLIF(TRIM(p.material_descripcion), ''),
        NULLIF(TRIM(si.sol_material), ''),
        'Material'
      ) AS mat_label,
      COALESCE(
        NULLIF(TRIM(p.unidad), ''),
        NULLIF(TRIM(si.sol_unidad), ''),
        'UND'
      ) AS und_label,
      si.pk_id,
      si.tramo,
      si.costado,
      si.abscisa_inicial,
      si.abscisa_final,
      CASE
        WHEN si.insumo_id IS NOT NULL THEN 'i:' || si.insumo_id::text
        ELSE 'd:' || lower(trim(both FROM COALESCE(
               NULLIF(TRIM(p.material_descripcion), ''),
               NULLIF(TRIM(si.sol_material), ''),
               'material'
             )))
             || '|' || lower(trim(both FROM COALESCE(
               NULLIF(TRIM(p.unidad), ''),
               NULLIF(TRIM(si.sol_unidad), ''),
               'und'
             )))
      END AS insumo_key
    FROM pending p
    LEFT JOIN sol_items si ON si.id = p.solicitud_item_id
  ),
  by_insumo AS (
    SELECT
      e.orden_compra_id,
      e.insumo_key,
      (array_agg(e.insumo_id) FILTER (WHERE e.insumo_id IS NOT NULL))[1] AS insumo_id,
      MIN(e.mat_label) AS material_descripcion,
      MIN(e.und_label) AS unidad,
      ROUND(SUM(e.saldo_cantidad)::numeric, 4) AS saldo_cantidad,
      ROUND(SUM(e.saldo_valor)::numeric, 2) AS saldo_valor,
      (array_agg(e.pk_id) FILTER (WHERE e.pk_id IS NOT NULL))[1] AS pk_id,
      (array_agg(e.tramo) FILTER (WHERE e.tramo IS NOT NULL))[1] AS tramo,
      (array_agg(e.costado) FILTER (WHERE e.costado IS NOT NULL))[1] AS costado,
      (array_agg(e.abscisa_inicial) FILTER (WHERE e.abscisa_inicial IS NOT NULL))[1] AS abscisa_inicial,
      (array_agg(e.abscisa_final) FILTER (WHERE e.abscisa_final IS NOT NULL))[1] AS abscisa_final,
      jsonb_agg(
        jsonb_build_object(
          'orden_compra_item_id', e.orden_compra_item_id,
          'saldo_cantidad', ROUND(e.saldo_cantidad::numeric, 4),
          'pk_id', e.pk_id
        )
        ORDER BY e.orden_compra_item_id
      ) AS lineas
    FROM enriched e
    GROUP BY e.orden_compra_id, e.insumo_key
  ),
  cards AS (
    SELECT
      oc.id AS orden_compra_id,
      oc.numero_oc,
      oc.proveedor_id,
      COALESCE(NULLIF(TRIM(oc.proveedor_nombre), ''), NULLIF(TRIM(prov.razon_social), ''), '') AS proveedor_nombre,
      oc.solicitud_id,
      sol.consecutivo AS solicitud_consecutivo,
      sol.titulo AS solicitud_titulo,
      oc.created_at,
      ROUND(SUM(bi.saldo_cantidad)::numeric, 4) AS saldo_cantidad_total,
      jsonb_agg(
        jsonb_build_object(
          'key', bi.insumo_key,
          'insumo_id', bi.insumo_id,
          'material_descripcion', bi.material_descripcion,
          'unidad', bi.unidad,
          'saldo_cantidad', bi.saldo_cantidad,
          'saldo_valor', bi.saldo_valor,
          'pk_id', bi.pk_id,
          'tramo', bi.tramo,
          'costado', bi.costado,
          'abscisa_inicial', bi.abscisa_inicial,
          'abscisa_final', bi.abscisa_final,
          'lineas', bi.lineas
        )
        ORDER BY bi.material_descripcion
      ) AS insumos
    FROM ocs oc
    INNER JOIN by_insumo bi ON bi.orden_compra_id = oc.id
    LEFT JOIN public.almacen_proveedor prov ON prov.id = oc.proveedor_id
    LEFT JOIN public.almacen_solicitud sol ON sol.id = oc.solicitud_id
    GROUP BY
      oc.id, oc.numero_oc, oc.proveedor_id, oc.proveedor_nombre, oc.solicitud_id,
      prov.razon_social, sol.consecutivo, sol.titulo, oc.created_at
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'orden_compra_id', c.orden_compra_id,
          'numero_oc', c.numero_oc,
          'proveedor_id', c.proveedor_id,
          'proveedor_nombre', c.proveedor_nombre,
          'solicitud_id', c.solicitud_id,
          'solicitud_consecutivo', c.solicitud_consecutivo,
          'solicitud_titulo', c.solicitud_titulo,
          'saldo_cantidad_total', c.saldo_cantidad_total,
          'insumos', c.insumos
        )
        ORDER BY c.created_at DESC
      )
      FROM cards c
    ),
    '[]'::jsonb
  );
$$;

COMMENT ON FUNCTION public.almacen_ocs_pendientes_tarjeta(integer) IS
  'Tarjetas consolidadas de OC con saldo (una OC, varios insumos) para registro tablet.';

GRANT EXECUTE ON FUNCTION public.almacen_ocs_pendientes_tarjeta(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.almacen_ocs_pendientes_tarjeta(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.almacen_ocs_pendientes_tarjeta(integer) TO anon;

NOTIFY pgrst, 'reload schema';
