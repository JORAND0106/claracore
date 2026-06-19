-- Dashboard SICOE — resumen en una sola consulta (sin tabla cobro).
-- Obra: aprobado y «cola» según el nivel máximo activo del contrato (p_campo_nivel_max).
-- Presupuesto: columna revisado (validación en polígonos); los campos JSON *aprobado_n3* son etiqueta histórica.
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql) y, en la misma BD,
--   public._dash_norm_capitulo_key + public._dash_matriz_nivel_max_estado (ver dashboard_drill_agg.sql).
-- Ejecutar primero dashboard_drill_agg.sql si aún no existen esas funciones.

DROP FUNCTION IF EXISTS public.dashboard_resumen_sicoe_agg(bigint);
DROP FUNCTION IF EXISTS public.dashboard_resumen_sicoe_agg(bigint, text);

CREATE OR REPLACE FUNCTION public.dashboard_resumen_sicoe_agg(
  p_contrato_id bigint,
  p_campo_nivel_max text DEFAULT 'nivel3_estado',
  p_niveles_activos bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
regs AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capítulo'
        ELSE r.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(r.item_numero) AS it,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    r.cantidad_total::numeric AS cq,
    r.acta_rpo_id AS aid,
    public._dash_matriz_nivel_max_estado(
      p_campo_nivel_max,
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6,
    COALESCE(TRIM(r.item_numero::text), '') <> '' AS has_item
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
),
sicoe_item AS (
  SELECT
    cap,
    it,
    aid,
    MAX(vu) AS vu,
    SUM(cq) FILTER (WHERE nmax = 'Aprobado') AS ap_q,
    SUM(cq) FILTER (
      WHERE has_item
        AND public._dash_prereqs_activos_aprobados_norm(
          p_niveles_activos,
          public._dash_nivel_num_desde_campo(p_campo_nivel_max),
          n1, n2, n3, n4, n5, n6
        )
        AND nmax = 'No Revisado'
    ) AS nr_q
  FROM regs
  WHERE it IS NOT NULL
  GROUP BY cap, it, aid
),
tot_cob AS (
  SELECT COALESCE(SUM(public.dash_costo_agregado(ap_q, vu)), 0)::numeric AS t
  FROM sicoe_item
  WHERE ap_q IS NOT NULL AND ap_q <> 0
),
obra_caps AS (
  SELECT cap, SUM(public.dash_costo_agregado(ap_q, vu)) AS cob
  FROM sicoe_item
  GROUP BY cap
),
obra_nr_caps AS (
  SELECT cap, SUM(public.dash_costo_agregado(nr_q, vu)) AS cob_nr
  FROM sicoe_item
  WHERE nr_q IS NOT NULL AND nr_q <> 0
  GROUP BY cap
),
tot_nr AS (
  SELECT COALESCE(SUM(cob_nr), 0)::numeric AS t FROM obra_nr_caps
),
ppto_item AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN p.capitulo IS NULL OR btrim(p.capitulo::text) = '' THEN 'Sin capítulo'
        ELSE p.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(p.item) AS it,
    public._norm_estado_matriz(p.revisado) AS rv,
    MAX(COALESCE(p.vlr_unitario, 0)::numeric) AS vu,
    SUM(COALESCE(p.cant_total, 0)::numeric) AS cant
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1, 2, 3
),
ppto_estado AS (
  SELECT cap, rv, SUM(public.dash_costo_agregado(cant, vu)) AS costo
  FROM ppto_item
  GROUP BY cap, rv
),
ppto_ap_cap AS (
  SELECT cap, SUM(costo) AS pres_ap
  FROM ppto_estado
  WHERE rv = 'Aprobado'
  GROUP BY cap
),
ppto_nap_cap AS (
  SELECT cap, SUM(costo) AS pres_nr
  FROM ppto_estado
  WHERE rv <> 'Aprobado'
  GROUP BY cap
),
tot_ppto_ap AS (
  SELECT COALESCE(SUM(pres_ap), 0)::numeric AS t FROM ppto_ap_cap
),
tot_ppto_nap AS (
  SELECT COALESCE(SUM(pres_nr), 0)::numeric AS t FROM ppto_nap_cap
),
acta_item AS (
  SELECT aid, it, MAX(vu) AS vu, SUM(ap_q) AS ap_q
  FROM sicoe_item
  WHERE aid IS NOT NULL AND ap_q IS NOT NULL AND ap_q <> 0
  GROUP BY aid, it
),
acta_agg AS (
  SELECT a.numero_rpo::numeric AS nr, SUM(public.dash_costo_agregado(ai.ap_q, ai.vu)) AS cob
  FROM acta_item ai
  INNER JOIN public.actas a ON a.id = ai.aid AND a.contrato_id = p_contrato_id
  GROUP BY a.numero_rpo
),
ppto_rows AS (
  SELECT cap, SUM(costo) AS pres
  FROM ppto_estado
  GROUP BY cap
),
ppto_tot AS (
  SELECT COALESCE(SUM(pres), 0)::numeric AS t FROM ppto_rows
),
all_caps AS (
  SELECT cap FROM obra_caps
  UNION
  SELECT cap FROM ppto_rows
  UNION
  SELECT cap FROM obra_nr_caps
  UNION
  SELECT cap FROM ppto_ap_cap
  UNION
  SELECT cap FROM ppto_nap_cap
),
comparativo AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'capitulo', c.cap,
      'presupuesto', COALESCE(pr.pres, 0),
      'cobrado', round(COALESCE(ob.cob, 0)::numeric, 2),
      'sicoe_no_revisado_n3', round(COALESCE(onr.cob_nr, 0)::numeric, 2),
      'presupuesto_aprobado_n3', round(COALESCE(pap.pres_ap, 0)::numeric, 2),
      'presupuesto_no_revisado_n3', round(COALESCE(pnap.pres_nr, 0)::numeric, 2),
      'delta', round(COALESCE(pr.pres, 0) - COALESCE(ob.cob, 0), 2),
      'consumo_pct',
      CASE
        WHEN COALESCE(pr.pres, 0) > 0 THEN round(COALESCE(ob.cob, 0) / pr.pres * 100, 1)
        ELSE 0
      END
    )
    ORDER BY c.cap
  ) AS j
  FROM all_caps c
  LEFT JOIN obra_caps ob ON ob.cap = c.cap
  LEFT JOIN obra_nr_caps onr ON onr.cap = c.cap
  LEFT JOIN ppto_rows pr ON pr.cap = c.cap
  LEFT JOIN ppto_ap_cap pap ON pap.cap = c.cap
  LEFT JOIN ppto_nap_cap pnap ON pnap.cap = c.cap
),
por_acta AS (
  SELECT jsonb_agg(
    jsonb_build_object('acta', nr, 'cobrado', round(cob::numeric, 2))
    ORDER BY nr DESC NULLS LAST
  ) AS j
  FROM acta_agg
),
actas_list AS (
  SELECT jsonb_agg(nr ORDER BY nr DESC NULLS LAST) AS j FROM acta_agg
)
SELECT jsonb_build_object(
  'dashboard_schema', 2,
  'total_presupuesto', (SELECT t FROM ppto_tot),
  'total_cobrado', round((SELECT t FROM tot_cob), 2),
  'total_sicoe_n3_no_revisado', round((SELECT t FROM tot_nr), 2),
  'total_presupuesto_aprobado_n3', round((SELECT t FROM tot_ppto_ap), 2),
  'total_presupuesto_no_revisado_n3', round((SELECT t FROM tot_ppto_nap), 2),
  'delta', round((SELECT t FROM ppto_tot) - (SELECT t FROM tot_cob), 2),
  'consumo_pct',
  CASE
    WHEN (SELECT t FROM ppto_tot) > 0 THEN round((SELECT t FROM tot_cob) / (SELECT t FROM ppto_tot) * 100, 1)
    ELSE 0
  END,
  'actas', COALESCE((SELECT j FROM actas_list), '[]'::jsonb),
  'comparativo_capitulos', COALESCE((SELECT j FROM comparativo), '[]'::jsonb),
  'por_acta', COALESCE((SELECT j FROM por_acta), '[]'::jsonb)
);
$f$;

COMMENT ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) IS
  'Dashboard resumen v2: obra según nivel máximo y prerequisitos de niveles activos; presupuesto por revisado.';

GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) TO service_role;
