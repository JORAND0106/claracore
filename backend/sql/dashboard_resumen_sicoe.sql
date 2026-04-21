-- Dashboard SICOE — resumen (total cobrado, por capítulo, por acta) en una sola consulta.
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql).
-- Ejecutar en Supabase SQL Editor (o migración) para que el backend use RPC dashboard_resumen_sicoe_agg.

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
    public._norm_estado_matriz(r.nivel3_estado) AS n3
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
),
comparativo AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'capitulo', c.cap,
      'presupuesto', COALESCE(pr.pres, 0),
      'cobrado', round(COALESCE(ob.cob, 0)::numeric, 2),
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
  LEFT JOIN ppto_rows pr ON pr.cap = c.cap
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
  'total_presupuesto', (SELECT t FROM ppto_tot),
  'total_cobrado', round((SELECT t FROM tot_cob), 2),
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
  'Agrega dashboard resumen SICOE (obra aprobada N3, presupuesto por capítulo) en BD; evita paginar so_registros desde el backend.';

GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint) TO service_role;
