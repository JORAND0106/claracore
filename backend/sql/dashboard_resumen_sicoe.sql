-- Dashboard SICOE — resumen en una sola consulta (sin tabla cobro).
-- Incluye: SICOE N3 aprobado, SICOE N3 no revisado (cola interventoría), presupuesto total
-- y presupuesto ClaraCore partido por columna revisado (= validación tipo N3 en polígonos).
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql).
-- Ejecutar en Supabase SQL Editor para reemplazar dashboard_resumen_sicoe_agg.

CREATE OR REPLACE FUNCTION public.dashboard_resumen_sicoe_agg(p_contrato_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
regs AS (
  SELECT
    CASE
      WHEN r.capitulo IS NULL OR r.capitulo = '' THEN 'Sin capítulo'
      ELSE r.capitulo
    END AS cap,
    r.costo_directo::numeric AS cd,
    r.acta_rpo_id AS aid,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    COALESCE(TRIM(r.item_numero), '') <> '' AS has_item
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
),
aprob AS (
  SELECT cap, cd, aid FROM regs WHERE n3 = 'Aprobado'
),
tot_cob AS (
  SELECT COALESCE(SUM(cd), 0)::numeric AS t FROM aprob
),
obra_caps AS (
  SELECT cap, SUM(cd) AS cob FROM aprob GROUP BY cap
),
-- SICOE en cola interventoría (N1+N2 aprobados) con N3 = No Revisado
obra_nr_caps AS (
  SELECT cap, SUM(cd) AS cob_nr
  FROM regs
  WHERE has_item
    AND n1 = 'Aprobado'
    AND n2 = 'Aprobado'
    AND n3 = 'No Revisado'
  GROUP BY cap
),
tot_nr AS (
  SELECT COALESCE(SUM(cob_nr), 0)::numeric AS t FROM obra_nr_caps
),
ppto_rows AS (
  SELECT
    CASE
      WHEN v.capitulo IS NULL OR v.capitulo = '' THEN 'Sin capítulo'
      ELSE v.capitulo
    END AS cap,
    SUM(COALESCE(v.presupuesto, 0)::numeric) AS pres
  FROM public.vista_ppto_por_capitulo v
  WHERE v.contrato_id = p_contrato_id
  GROUP BY 1
),
ppto_tot AS (
  SELECT COALESCE(SUM(pres), 0)::numeric AS t FROM ppto_rows
),
-- Presupuesto ClaraCore: costo por capítulo según revisado (Aprobado vs resto)
ppto_estado AS (
  SELECT
    CASE
      WHEN p.capitulo IS NULL OR TRIM(p.capitulo) = '' THEN 'Sin capítulo'
      ELSE TRIM(p.capitulo)
    END AS cap,
    public._norm_estado_matriz(p.revisado) AS rv,
    SUM(COALESCE(p.costo_directo, 0)::numeric) AS costo
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
  GROUP BY 1, 2
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
acta_agg AS (
  SELECT a.numero_rpo::numeric AS nr, SUM(ap.cd) AS cob
  FROM aprob ap
  INNER JOIN public.actas a ON a.id = ap.aid AND a.contrato_id = p_contrato_id
  GROUP BY a.numero_rpo
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

COMMENT ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint) IS
  'Dashboard resumen v2: SICOE N3 aprobado/no rev., presupuesto por revisado (N3 polígonos), sin cobro; todo agregado en BD.';

GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint) TO service_role;
