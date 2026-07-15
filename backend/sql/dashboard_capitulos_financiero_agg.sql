-- Panorama financiero por capítulo (AIU + IVA) para dashboard-capitulos-financiero.
-- Requiere: dashboard_drill_agg.sql (_dash_norm_*, dash_costo_agregado, _dash_matriz_nivel_max_estado)
--           rpo_panel_admin_agg.sql (rpo_panel_bloque_capitulo)

CREATE OR REPLACE FUNCTION public._gerencial_item_bloque(
  p_tipo_calculo text,
  p_capitulo text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN upper(btrim(COALESCE(p_tipo_calculo, ''))) = 'IVA' THEN 'iva'
    WHEN upper(btrim(COALESCE(p_tipo_calculo, ''))) = 'AIU' THEN 'aiu'
    WHEN public.rpo_panel_bloque_capitulo(p_capitulo) = 'ensayos' THEN 'iva'
    ELSE 'aiu'
  END;
$f$;

CREATE OR REPLACE FUNCTION public.dashboard_capitulos_financiero_agg(
  p_contrato_id bigint,
  p_vista text DEFAULT 'presupuesto_obra',
  p_solo_interv_aprobado boolean DEFAULT false,
  p_acta_rpo_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $BODY$
WITH cfg AS (
  SELECT
    COALESCE(
      (SELECT c.niveles_activos::bigint[]
         FROM public.contrato_niveles_validacion c
        WHERE c.contrato_id = p_contrato_id
        LIMIT 1),
      ARRAY[1::bigint, 2::bigint, 3::bigint]
    ) AS na,
    COALESCE(
      (SELECT max(u::smallint) FROM unnest(
        COALESCE(
          (SELECT c.niveles_activos::bigint[]
             FROM public.contrato_niveles_validacion c
            WHERE c.contrato_id = p_contrato_id
            LIMIT 1),
          ARRAY[1::bigint, 2::bigint, 3::bigint]
        )
      ) AS u(u)),
      3::smallint
    ) AS nmax_num
),
cfg2 AS (
  SELECT
    na,
    nmax_num,
    ('nivel' || nmax_num::text || '_estado') AS campo_max
  FROM cfg
),
vista_cfg AS (
  SELECT
    CASE
      WHEN lower(btrim(COALESCE(p_vista, ''))) IN ('obra_ejecutada', 'obra ejecutada')
        THEN 'Obra Ejecutada'
      ELSE 'Presupuesto de Obra'
    END AS tipo_ppto,
    (lower(btrim(COALESCE(p_vista, ''))) IN ('obra_ejecutada', 'obra ejecutada')) AS oe
),
oficial AS (
  SELECT pv.id
  FROM public.presupuesto_versiones pv
  WHERE pv.contrato_id = p_contrato_id
    AND COALESCE(pv.es_vigente_aprobada, false) = true
  LIMIT 1
),
listado AS (
  SELECT
    public._dash_norm_capitulo_key(lp.capitulo) AS cap_k,
    public._dash_norm_item_key(lp.item_numero) AS it_k,
    (array_agg(upper(btrim(COALESCE(lp.tipo_calculo, ''))) ORDER BY lp.capitulo, lp.item_numero))[1] AS tc,
    MAX(COALESCE(lp.precio_unitario, 0)::numeric) AS lp_vu
  FROM public.listado_precios lp
  WHERE lp.contrato_id = p_contrato_id
    AND public._dash_norm_item_key(lp.item_numero) IS NOT NULL
  GROUP BY 1, 2
),
ppto_raw AS (
  SELECT
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS it_k,
    public._dash_norm_capitulo(p.capitulo) AS cap_display,
    COALESCE(p.cant_total, 0)::numeric AS cq,
    COALESCE(p.vlr_unitario, 0)::numeric AS vu,
    public._norm_estado_matriz(p.revisado) AS rev
  FROM public.presupuesto_version_items p
  CROSS JOIN vista_cfg v
  CROSS JOIN oficial o
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.version_id = o.id
    AND v.tipo_ppto = 'Presupuesto de Obra'
    AND public._dash_norm_item_key(p.item) IS NOT NULL
    AND (
      NOT COALESCE(p_solo_interv_aprobado, false)
      OR p.pre_interv_estado IS NULL
      OR btrim(p.pre_interv_estado) = 'Aprobado'
    )
  UNION ALL
  SELECT
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS it_k,
    public._dash_norm_capitulo(p.capitulo) AS cap_display,
    COALESCE(p.cant_total, 0)::numeric AS cq,
    COALESCE(p.vlr_unitario, 0)::numeric AS vu,
    public._norm_estado_matriz(p.revisado) AS rev
  FROM public.presupuesto p
  CROSS JOIN vista_cfg v
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.tipo_ejecucion = v.tipo_ppto
    AND public._dash_norm_item_key(p.item) IS NOT NULL
    AND (
      v.tipo_ppto = 'Obra Ejecutada'
      OR NOT EXISTS (SELECT 1 FROM oficial o WHERE o.id IS NOT NULL)
    )
    AND (
      NOT COALESCE(p_solo_interv_aprobado, false)
      OR p.pre_interv_estado IS NULL
      OR btrim(p.pre_interv_estado) = 'Aprobado'
    )
),
ppto_items AS (
  SELECT
    cap_k,
    it_k,
    MAX(cap_display) AS cap_display,
    MAX(vu) AS vu,
    SUM(CASE WHEN rev = 'Aprobado' THEN cq ELSE 0 END) AS ap_q,
    SUM(CASE WHEN rev = 'Pendiente' THEN cq ELSE 0 END) AS pe_q,
    SUM(CASE WHEN rev = 'Rechazado' THEN cq ELSE 0 END) AS re_q,
    SUM(CASE WHEN rev NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cq ELSE 0 END) AS nr_q
  FROM ppto_raw
  GROUP BY cap_k, it_k
),
ppto_costs AS (
  SELECT
    pi.cap_k,
    pi.it_k,
    pi.cap_display,
    public.dash_costo_agregado(pi.ap_q, COALESCE(NULLIF(pi.vu, 0), l.lp_vu, 0)) AS ap,
    public.dash_costo_agregado(pi.pe_q, COALESCE(NULLIF(pi.vu, 0), l.lp_vu, 0)) AS pe,
    public.dash_costo_agregado(pi.re_q, COALESCE(NULLIF(pi.vu, 0), l.lp_vu, 0)) AS re,
    public.dash_costo_agregado(pi.nr_q, COALESCE(NULLIF(pi.vu, 0), l.lp_vu, 0)) AS nr
  FROM ppto_items pi
  LEFT JOIN listado l ON l.cap_k = pi.cap_k AND l.it_k = pi.it_k
),
sicoe_regs AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capítulo'
        ELSE r.capitulo::text
      END
    ) AS cap_k,
    public._dash_norm_item_key(r.item_numero) AS it_k,
    public._dash_norm_capitulo(r.capitulo) AS cap_display,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    COALESCE(r.cantidad_total, 0)::numeric AS cq,
    public._dash_matriz_nivel_max_estado(
      (SELECT campo_max FROM cfg2),
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND (p_acta_rpo_id IS NULL OR r.acta_rpo_id = p_acta_rpo_id)
    AND public._dash_norm_item_key(r.item_numero) IS NOT NULL
),
sicoe_items AS (
  SELECT
    cap_k,
    it_k,
    MAX(cap_display) AS cap_display,
    public.dash_costo_agregado(
      SUM(cq) FILTER (WHERE nmax = 'Aprobado'),
      MAX(vu)
    ) AS ap_c
  FROM sicoe_regs
  GROUP BY cap_k, it_k
),
all_keys AS (
  SELECT cap_k, it_k FROM ppto_costs
  UNION
  SELECT s.cap_k, s.it_k
  FROM sicoe_items s
  -- <> 0 (no solo > 0): los registros de reversión "No Previsto" cobran cantidades
  -- negativas; deben netearse, no descartarse (igual que el drill/Excel).
  WHERE COALESCE(s.ap_c, 0) <> 0
),
item_rows AS (
  SELECT
    ak.cap_k,
    ak.it_k,
    COALESCE(p.cap_display, s.cap_display, ak.cap_k) AS cap_display,
    public._gerencial_item_bloque(l.tc, COALESCE(p.cap_display, s.cap_display, ak.cap_k)) AS bloque,
    COALESCE(p.ap, 0)::numeric AS ap,
    COALESCE(p.pe, 0)::numeric AS pe,
    COALESCE(p.re, 0)::numeric AS re,
    COALESCE(p.nr, 0)::numeric AS nr,
    COALESCE(s.ap_c, 0)::numeric AS cob,
    CASE
      WHEN p.it_k IS NOT NULL AND (SELECT oe FROM vista_cfg) THEN
        COALESCE(p.ap, 0) + COALESCE(p.pe, 0) + COALESCE(p.re, 0) + COALESCE(p.nr, 0)
      WHEN p.it_k IS NOT NULL THEN
        COALESCE(p.ap, 0) + COALESCE(p.nr, 0)
      WHEN COALESCE(s.ap_c, 0) <> 0 THEN COALESCE(s.ap_c, 0)
      ELSE 0::numeric
    END AS claracore
  FROM all_keys ak
  LEFT JOIN ppto_costs p ON p.cap_k = ak.cap_k AND p.it_k = ak.it_k
  LEFT JOIN sicoe_items s ON s.cap_k = ak.cap_k AND s.it_k = ak.it_k
  LEFT JOIN listado l ON l.cap_k = ak.cap_k AND l.it_k = ak.it_k
  WHERE p.it_k IS NOT NULL OR COALESCE(s.ap_c, 0) <> 0
),
cap_agg AS (
  SELECT
    ir.bloque,
    ir.cap_k,
    MAX(ir.cap_display) AS capitulo,
    ROUND(SUM(ir.claracore), 0)::numeric AS claracore,
    ROUND(SUM(ir.cob), 0)::numeric AS cobrado,
    ROUND(SUM(ir.ap), 0)::numeric AS aprobado,
    ROUND(SUM(ir.pe), 0)::numeric AS pendiente,
    ROUND(SUM(ir.re), 0)::numeric AS rechazado,
    ROUND(SUM(ir.nr), 0)::numeric AS no_revisado
  FROM item_rows ir
  WHERE ir.bloque IN ('aiu', 'iva')
    AND (ir.claracore <> 0 OR ir.cob <> 0)
  GROUP BY ir.bloque, ir.cap_k
),
cap_json AS (
  SELECT
    bloque,
    jsonb_agg(
      jsonb_build_object(
        'capitulo', c.capitulo,
        'claracore', c.claracore,
        'cobrado', c.cobrado,
        'delta', c.claracore - c.cobrado,
        'aprobado', c.aprobado,
        'pendiente', c.pendiente,
        'rechazado', c.rechazado,
        'no_revisado', c.no_revisado
      )
      ORDER BY
        CASE WHEN c.capitulo ~ '^\s*(\d+)' THEN (substring(c.capitulo FROM '^\s*(\d+)'))::int ELSE 999999 END,
        lower(c.capitulo)
    ) AS rows
  FROM cap_agg c
  GROUP BY bloque
)
SELECT jsonb_build_object(
  'capitulos_aiu', COALESCE((SELECT rows FROM cap_json WHERE bloque = 'aiu'), '[]'::jsonb),
  'capitulos_iva', COALESCE((SELECT rows FROM cap_json WHERE bloque = 'iva'), '[]'::jsonb)
);
$BODY$;

COMMENT ON FUNCTION public.dashboard_capitulos_financiero_agg(bigint, text, boolean, bigint) IS
  'Dashboard capitulos-financiero: agregación AIU/IVA por capítulo (presupuesto + SICOE aprobado).';

GRANT EXECUTE ON FUNCTION public._gerencial_item_bloque(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_capitulos_financiero_agg(bigint, text, boolean, bigint)
  TO authenticated, service_role;
