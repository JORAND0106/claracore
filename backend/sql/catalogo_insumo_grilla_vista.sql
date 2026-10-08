-- ClaraCore — Vista liviana de la grilla del catálogo de insumos.
-- Solo las columnas que muestra la grilla, ya resueltas en columnas escalares.
-- No lee cotizaciones_detalle, adjuntos ni historial en cada carga.
-- Idempotente. El backend usa service_role; anon/authenticated no leen la vista.

-- Rellena número, fecha, valor y proveedor desde la cotización ganadora
-- cuando esas columnas quedaron vacías. Se hace una sola vez, no en cada listado.
UPDATE public.almacen_insumo AS i
SET
  cotizacion_numero = COALESCE(NULLIF(btrim(i.cotizacion_numero), ''), gan.numero),
  cotizacion_fecha = COALESCE(i.cotizacion_fecha, gan.fecha),
  costo_base = COALESCE(i.costo_base, gan.valor),
  proveedor_id = COALESCE(i.proveedor_id, gan.proveedor_id)
FROM (
  SELECT DISTINCT ON (i2.id)
    i2.id,
    NULLIF(btrim(elem->>'numero'), '') AS numero,
    CASE
      WHEN (elem->>'fecha') ~ '^\d{4}-\d{2}-\d{2}' THEN left(elem->>'fecha', 10)::date
      ELSE NULL
    END AS fecha,
    CASE
      WHEN (elem->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (elem->>'valor')::numeric
      ELSE NULL
    END AS valor,
    CASE
      WHEN (elem->>'proveedor_id') ~ '^[0-9]+$' THEN (elem->>'proveedor_id')::bigint
      ELSE NULL
    END AS proveedor_id
  FROM public.almacen_insumo AS i2
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i2.cotizaciones_detalle, '[]'::jsonb)) AS elem
  WHERE COALESCE(elem->>'tipo', 'insumo') = 'insumo'
    AND (
      i2.cotizacion_numero IS NULL
      OR btrim(i2.cotizacion_numero) = ''
      OR i2.costo_base IS NULL
      OR i2.proveedor_id IS NULL
    )
  ORDER BY i2.id, CASE WHEN lower(COALESCE(elem->>'es_ganadora', '')) IN ('true', 't', '1') THEN 0 ELSE 1 END
) AS gan
WHERE i.id = gan.id;

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_grilla_contrato_codigo
  ON public.almacen_insumo (contrato_id, codigo)
  WHERE activo IS TRUE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_grilla_codigo_trgm
  ON public.almacen_insumo USING gin (codigo gin_trgm_ops)
  WHERE activo IS TRUE;

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_grilla_desc_trgm
  ON public.almacen_insumo USING gin (descripcion gin_trgm_ops)
  WHERE activo IS TRUE;

CREATE OR REPLACE VIEW public.v_catalogo_insumo_grilla
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.contrato_id,
  i.codigo,
  i.descripcion,
  i.unidad,
  i.rendimiento,
  i.proveedor_id,
  COALESCE(
    NULLIF(btrim(p.razon_social), ''),
    (
      SELECT NULLIF(btrim(elem->>'proveedor'), '')
      FROM jsonb_array_elements(COALESCE(i.cotizaciones_detalle, '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'tipo', 'insumo') = 'insumo'
      ORDER BY CASE WHEN lower(COALESCE(elem->>'es_ganadora', '')) IN ('true', 't', '1') THEN 0 ELSE 1 END
      LIMIT 1
    ),
    '—'
  ) AS proveedor_nombre,
  i.tipo_impuesto,
  i.impuesto_porcentaje,
  i.tributos,
  i.cantidad_negociada,
  COALESCE(
    NULLIF(btrim(i.cotizacion_numero), ''),
    (
      SELECT NULLIF(btrim(elem->>'numero'), '')
      FROM jsonb_array_elements(COALESCE(i.cotizaciones_detalle, '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'tipo', 'insumo') = 'insumo'
      ORDER BY CASE WHEN lower(COALESCE(elem->>'es_ganadora', '')) IN ('true', 't', '1') THEN 0 ELSE 1 END
      LIMIT 1
    )
  ) AS cotizacion_numero,
  COALESCE(
    i.cotizacion_fecha,
    (
      SELECT CASE
        WHEN (elem->>'fecha') ~ '^\d{4}-\d{2}-\d{2}' THEN left(elem->>'fecha', 10)::date
        ELSE NULL
      END
      FROM jsonb_array_elements(COALESCE(i.cotizaciones_detalle, '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'tipo', 'insumo') = 'insumo'
      ORDER BY CASE WHEN lower(COALESCE(elem->>'es_ganadora', '')) IN ('true', 't', '1') THEN 0 ELSE 1 END
      LIMIT 1
    )
  ) AS cotizacion_fecha,
  COALESCE(
    i.costo_base,
    (
      SELECT CASE
        WHEN (elem->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (elem->>'valor')::numeric
        ELSE NULL
      END
      FROM jsonb_array_elements(COALESCE(i.cotizaciones_detalle, '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'tipo', 'insumo') = 'insumo'
      ORDER BY CASE WHEN lower(COALESCE(elem->>'es_ganadora', '')) IN ('true', 't', '1') THEN 0 ELSE 1 END
      LIMIT 1
    )
  ) AS costo_base,
  i.valor_compra_referencia
FROM public.almacen_insumo AS i
LEFT JOIN public.almacen_proveedor AS p
  ON p.id = i.proveedor_id
WHERE i.activo IS TRUE;

COMMENT ON VIEW public.v_catalogo_insumo_grilla IS
  'Grilla del catálogo de insumos: proveedor, código, descripción, unidad, rendimiento, tributo, cantidad negociada, cotización, fecha y valor. Sin cotizaciones_detalle. security_invoker aplica el RLS de almacen_insumo.';

REVOKE ALL ON public.v_catalogo_insumo_grilla FROM PUBLIC;
REVOKE ALL ON public.v_catalogo_insumo_grilla FROM anon, authenticated;
GRANT SELECT ON public.v_catalogo_insumo_grilla TO service_role;

NOTIFY pgrst, 'reload schema';
