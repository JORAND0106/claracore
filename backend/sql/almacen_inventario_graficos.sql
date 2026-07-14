-- Agregados para gráficos del tab Inventario (valor/cobro, entradas/salidas, cobro SICOE).
-- Filtros opcionales por capítulo e ítem del listado de precios / presupuesto.

DROP FUNCTION IF EXISTS public.almacen_inventario_graficos_agg(bigint);

CREATE OR REPLACE FUNCTION public.almacen_inventario_graficos_agg(
  p_contrato_id bigint,
  p_capitulo text DEFAULT NULL,
  p_item text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH filtro AS (
  SELECT
    NULLIF(trim(p_capitulo), '') AS cap_raw,
    NULLIF(trim(p_item), '') AS item_raw,
    public._dash_norm_capitulo_key(p_capitulo) AS cap_f,
    public._dash_norm_item_key(p_item) AS item_f
),
ppto AS (
  SELECT
    p.id,
    COALESCE(p.capitulo, '') AS capitulo,
    COALESCE(p.item, '') AS item,
    COALESCE(p.descripcion, '') AS descripcion,
    COALESCE(p.cant_total, 0)::numeric AS cant_ppto,
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS item_k
  FROM public.presupuesto p
  CROSS JOIN filtro f
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND (f.cap_f IS NULL OR public._dash_norm_capitulo_key(p.capitulo) = f.cap_f)
    AND (f.item_f IS NULL OR public._dash_norm_item_key(p.item) = f.item_f)
),
mov AS (
  SELECT
    m.presupuesto_id,
    MAX(m.material_descripcion) AS material_descripcion,
    SUM(CASE WHEN m.tipo = 'entrada' THEN COALESCE(m.cantidad, 0) ELSE 0 END) AS entradas,
    SUM(CASE WHEN m.tipo = 'salida' THEN COALESCE(m.cantidad, 0) ELSE 0 END) AS salidas
  FROM public.almacen_movimiento m
  LEFT JOIN public.presupuesto p ON p.id = m.presupuesto_id
  CROSS JOIN filtro f
  WHERE m.contrato_id = p_contrato_id
    AND (
      f.cap_f IS NULL
      OR public._dash_norm_capitulo_key(p.capitulo) = f.cap_f
    )
    AND (
      f.item_f IS NULL
      OR public._dash_norm_item_key(p.item) = f.item_f
    )
  GROUP BY m.presupuesto_id
),
joined AS (
  SELECT
    mov.presupuesto_id,
    mov.material_descripcion,
    ppto.capitulo,
    ppto.item,
    COALESCE(ppto.descripcion, mov.material_descripcion, '') AS descripcion,
    COALESCE(ppto.cant_ppto, 0) AS presupuesto,
    mov.entradas,
    mov.salidas,
    ppto.cap_k,
    ppto.item_k
  FROM mov
  LEFT JOIN ppto ON ppto.id = mov.presupuesto_id
),
cobrado AS (
  SELECT
    public._dash_norm_capitulo_key(r.capitulo) AS cap_k,
    public._dash_norm_item_key(r.item_numero) AS item_k,
    SUM(COALESCE(r.cantidad_total, 0))::numeric AS cobrado
  FROM public.so_registros r
  CROSS JOIN filtro f
  WHERE r.contrato_id = p_contrato_id
    AND COALESCE(public._norm_estado_matriz(r.nivel3_estado), '') = 'Aprobado'
    AND (f.cap_f IS NULL OR public._dash_norm_capitulo_key(r.capitulo) = f.cap_f)
    AND (f.item_f IS NULL OR public._dash_norm_item_key(r.item_numero) = f.item_f)
  GROUP BY 1, 2
),
joined_cob AS (
  SELECT
    j.*,
    COALESCE(c.cobrado, 0) AS cobrado
  FROM joined j
  LEFT JOIN cobrado c ON c.cap_k = j.cap_k AND c.item_k = j.item_k
),
mov_tot AS (
  SELECT
    round(COALESCE(SUM(entradas), 0), 4) AS entradas,
    round(COALESCE(SUM(salidas), 0), 4) AS salidas
  FROM mov
),
cob_tot AS (
  SELECT round(COALESCE(SUM(cobrado), 0), 4) AS cobrado
  FROM cobrado
),
listado_items AS (
  SELECT
    public._dash_norm_capitulo_key(lp.capitulo) AS cap_k,
    COALESCE(lp.capitulo, '') AS capitulo,
    public._dash_norm_item_key(lp.item_numero) AS item_k,
    COALESCE(lp.item_numero, '') AS item,
    COALESCE(lp.descripcion, '') AS descripcion,
    MAX(COALESCE(lp.precio_unitario, 0))::numeric AS valor_cobro
  FROM public.listado_precios lp
  CROSS JOIN filtro f
  WHERE lp.contrato_id = p_contrato_id
    AND (f.cap_f IS NULL OR public._dash_norm_capitulo_key(lp.capitulo) = f.cap_f)
    AND (f.item_f IS NULL OR public._dash_norm_item_key(lp.item_numero) = f.item_f)
  GROUP BY 1, 2, 3, 4, 5
),
insumo_costos AS (
  SELECT
    public._dash_norm_capitulo_key(COALESCE(NULLIF(trim(si.capitulo), ''), p.capitulo)) AS cap_k,
    public._dash_norm_item_key(COALESCE(NULLIF(trim(si.item), ''), p.item)) AS item_k,
    si.insumo_id,
    MAX(
      COALESCE(
        NULLIF(si.valor_compra_unitario, 0),
        NULLIF(ai.valor_compra_referencia, 0),
        NULLIF(ai.costo_base, 0),
        0
      )
    )::numeric AS costo_unit
  FROM public.almacen_solicitud_item si
  JOIN public.almacen_solicitud s ON s.id = si.solicitud_id
  JOIN public.presupuesto p ON p.id = si.presupuesto_id
  LEFT JOIN public.almacen_insumo ai ON ai.id = si.insumo_id
  CROSS JOIN filtro f
  WHERE s.contrato_id = p_contrato_id
    AND si.insumo_id IS NOT NULL
    AND COALESCE(s.estado, '') <> 'rechazada'
    AND (
      f.cap_f IS NULL
      OR public._dash_norm_capitulo_key(COALESCE(NULLIF(trim(si.capitulo), ''), p.capitulo)) = f.cap_f
    )
    AND (
      f.item_f IS NULL
      OR public._dash_norm_item_key(COALESCE(NULLIF(trim(si.item), ''), p.item)) = f.item_f
    )
  GROUP BY 1, 2, 3
),
costo_por_item AS (
  SELECT cap_k, item_k, round(SUM(costo_unit), 2) AS costo_insumos
  FROM insumo_costos
  GROUP BY 1, 2
),
valor_items AS (
  SELECT
    l.cap_k,
    l.capitulo,
    l.item_k,
    l.item,
    l.descripcion,
    round(l.valor_cobro, 2) AS valor_cobro,
    round(COALESCE(c.costo_insumos, 0), 2) AS costo_insumos
  FROM listado_items l
  LEFT JOIN costo_por_item c ON c.cap_k = l.cap_k AND c.item_k = l.item_k
),
valor_tot AS (
  SELECT
    round(COALESCE(SUM(valor_cobro), 0), 2) AS valor_cobro,
    round(COALESCE(SUM(costo_insumos), 0), 2) AS costo_insumos
  FROM valor_items
),
tot AS (
  SELECT
    vt.valor_cobro,
    vt.costo_insumos,
    mt.entradas,
    mt.salidas,
    ct.cobrado
  FROM valor_tot vt
  CROSS JOIN mov_tot mt
  CROSS JOIN cob_tot ct
),
top_mov AS (
  SELECT *
  FROM joined_cob
  ORDER BY entradas DESC NULLS LAST, salidas DESC NULLS LAST
  LIMIT 15
),
top_valor AS (
  SELECT *
  FROM valor_items
  ORDER BY valor_cobro DESC NULLS LAST, costo_insumos DESC NULLS LAST
  LIMIT 15
)
SELECT jsonb_build_object(
  'filtro', (
    SELECT jsonb_build_object('capitulo', f.cap_raw, 'item', f.item_raw)
    FROM filtro f
  ),
  'totales', COALESCE((SELECT to_jsonb(tot) FROM tot), '{}'::jsonb),
  'por_item', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'presupuesto_id', presupuesto_id,
        'capitulo', capitulo,
        'item', item,
        'material_descripcion', material_descripcion,
        'descripcion', descripcion,
        'presupuesto', round(presupuesto, 4),
        'entradas', round(entradas, 4),
        'salidas', round(salidas, 4),
        'cobrado', round(cobrado, 4)
      )
      ORDER BY entradas DESC
    )
    FROM top_mov
  ), '[]'::jsonb),
  'por_item_valor', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'capitulo', capitulo,
        'item', item,
        'descripcion', descripcion,
        'valor_cobro', valor_cobro,
        'costo_insumos', costo_insumos
      )
      ORDER BY valor_cobro DESC
    )
    FROM top_valor
  ), '[]'::jsonb),
  'generado_at', to_jsonb(now() AT TIME ZONE 'UTC')
);
$f$;

COMMENT ON FUNCTION public.almacen_inventario_graficos_agg(bigint, text, text) IS
  'Totales agregados para gráficos Inventario Almacén: valor cobro vs costo insumos, entradas/salidas y cobro SICOE; filtros opcionales capítulo/ítem.';

GRANT EXECUTE ON FUNCTION public.almacen_inventario_graficos_agg(bigint, text, text) TO authenticated, service_role;
