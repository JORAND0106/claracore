-- Cobrado dashboard: Σ dash_costo_agregado(Σ cantidad, V.U.) por ítem — nunca SUM(costo_directo) por línea.
-- Requiere public.dash_costo_agregado y helpers de dashboard_drill_agg.sql.

CREATE OR REPLACE FUNCTION public.dash_costo_agregado(p_cant numeric, p_vu numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_cant, 0) = 0 OR COALESCE(p_vu, 0) = 0 THEN 0::numeric
    ELSE round(round(COALESCE(p_cant, 0), 2) * COALESCE(p_vu, 0), 0)
  END;
$$;

COMMENT ON FUNCTION public.dash_costo_agregado(numeric, numeric) IS
  'Costo agregado dashboard: round(round(cant,2)×VU, 0). No usar SUM(costo_directo) para totales.';

DROP MATERIALIZED VIEW IF EXISTS public.vm_dashboard_por_acta CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.vm_dashboard_resumen CASCADE;

CREATE MATERIALIZED VIEW public.vm_dashboard_resumen AS
WITH regs AS (
    SELECT
        r.contrato_id,
        public._dash_norm_capitulo_key(
            CASE
                WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capítulo'
                ELSE r.capitulo::text
            END
        ) AS capitulo,
        public._dash_norm_item_key(r.item_numero) AS it,
        COALESCE(r.vlr_unitario, 0)::numeric AS vu,
        round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
        r.costo_directo::numeric AS cd,
        public._norm_estado_matriz(r.nivel1_estado) AS n1,
        public._norm_estado_matriz(r.nivel2_estado) AS n2,
        public._norm_estado_matriz(r.nivel3_estado) AS n3,
        public._norm_estado_matriz(r.nivel4_estado) AS n4,
        public._norm_estado_matriz(r.nivel5_estado) AS n5,
        public._norm_estado_matriz(r.nivel6_estado) AS n6,
        public._dash_matriz_nivel_max_estado('nivel1_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax1,
        public._dash_matriz_nivel_max_estado('nivel2_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax2,
        public._dash_matriz_nivel_max_estado('nivel3_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax3,
        public._dash_matriz_nivel_max_estado('nivel4_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax4,
        public._dash_matriz_nivel_max_estado('nivel5_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax5,
        public._dash_matriz_nivel_max_estado('nivel6_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax6,
        COALESCE(TRIM(r.item_numero::text), '') <> '' AS has_item
    FROM public.so_registros r
),
item_agg AS (
    SELECT
        contrato_id,
        capitulo,
        it,
        MAX(vu) AS vu,
        SUM(cq) FILTER (WHERE nmax1 = 'Aprobado') AS ap_q1,
        SUM(cq) FILTER (WHERE nmax2 = 'Aprobado') AS ap_q2,
        SUM(cq) FILTER (WHERE nmax3 = 'Aprobado') AS ap_q3,
        SUM(cq) FILTER (WHERE nmax4 = 'Aprobado') AS ap_q4,
        SUM(cq) FILTER (WHERE nmax5 = 'Aprobado') AS ap_q5,
        SUM(cq) FILTER (WHERE nmax6 = 'Aprobado') AS ap_q6,
        SUM(cq) FILTER (WHERE has_item AND nmax3 = 'No Revisado') AS nr_q3,
        SUM(cq) FILTER (WHERE has_item AND nmax4 = 'No Revisado') AS nr_q4,
        SUM(cq) FILTER (WHERE has_item AND nmax5 = 'No Revisado') AS nr_q5,
        SUM(cq) FILTER (WHERE has_item AND nmax6 = 'No Revisado') AS nr_q6
    FROM regs
    WHERE it IS NOT NULL
    GROUP BY contrato_id, capitulo, it
),
item_cost AS (
    SELECT
        contrato_id,
        capitulo,
        public.dash_costo_agregado(ap_q1, vu) AS c1,
        public.dash_costo_agregado(ap_q2, vu) AS c2,
        public.dash_costo_agregado(ap_q3, vu) AS c3,
        public.dash_costo_agregado(ap_q4, vu) AS c4,
        public.dash_costo_agregado(ap_q5, vu) AS c5,
        public.dash_costo_agregado(ap_q6, vu) AS c6,
        public.dash_costo_agregado(nr_q3, vu) AS nr3,
        public.dash_costo_agregado(nr_q4, vu) AS nr4,
        public.dash_costo_agregado(nr_q5, vu) AS nr5,
        public.dash_costo_agregado(nr_q6, vu) AS nr6
    FROM item_agg
),
cap_cob AS (
    SELECT
        contrato_id,
        capitulo,
        SUM(c1) AS cobrado_nivel1,
        SUM(c2) AS cobrado_nivel2,
        SUM(c3) AS cobrado_nivel3,
        SUM(c4) AS cobrado_nivel4,
        SUM(c5) AS cobrado_nivel5,
        SUM(c6) AS cobrado_nivel6,
        SUM(nr3) AS no_revisado_nivel3,
        SUM(nr4) AS no_revisado_nivel4,
        SUM(nr5) AS no_revisado_nivel5,
        SUM(nr6) AS no_revisado_nivel6
    FROM item_cost
    GROUP BY contrato_id, capitulo
),
cap_reg_stats AS (
    SELECT
        contrato_id,
        capitulo,
        COUNT(*)::bigint AS total_registros,
        COALESCE(SUM(cd), 0)::numeric AS total_costo
    FROM regs
    GROUP BY contrato_id, capitulo
)
SELECT
    c.contrato_id,
    c.capitulo,
    COALESCE(rs.total_registros, 0)::bigint AS total_registros,
    COALESCE(rs.total_costo, 0)::numeric AS total_costo,
    COALESCE(c.cobrado_nivel1, 0)::numeric AS cobrado_nivel1,
    COALESCE(c.cobrado_nivel2, 0)::numeric AS cobrado_nivel2,
    COALESCE(c.cobrado_nivel3, 0)::numeric AS cobrado_nivel3,
    COALESCE(c.cobrado_nivel4, 0)::numeric AS cobrado_nivel4,
    COALESCE(c.cobrado_nivel5, 0)::numeric AS cobrado_nivel5,
    COALESCE(c.cobrado_nivel6, 0)::numeric AS cobrado_nivel6,
    COALESCE(c.no_revisado_nivel3, 0)::numeric AS no_revisado_nivel3,
    COALESCE(c.no_revisado_nivel4, 0)::numeric AS no_revisado_nivel4,
    COALESCE(c.no_revisado_nivel5, 0)::numeric AS no_revisado_nivel5,
    COALESCE(c.no_revisado_nivel6, 0)::numeric AS no_revisado_nivel6
FROM cap_cob c
LEFT JOIN cap_reg_stats rs USING (contrato_id, capitulo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_dashboard_resumen_cap
    ON public.vm_dashboard_resumen (contrato_id, capitulo);
CREATE INDEX IF NOT EXISTS idx_vm_dashboard_resumen_contrato
    ON public.vm_dashboard_resumen (contrato_id);

CREATE MATERIALIZED VIEW public.vm_dashboard_por_acta AS
WITH regs AS (
    SELECT
        r.contrato_id,
        r.acta_rpo_id AS aid,
        public._dash_norm_item_key(r.item_numero) AS it,
        COALESCE(r.vlr_unitario, 0)::numeric AS vu,
        round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
        public._dash_matriz_nivel_max_estado('nivel1_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax1,
        public._dash_matriz_nivel_max_estado('nivel2_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax2,
        public._dash_matriz_nivel_max_estado('nivel3_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax3,
        public._dash_matriz_nivel_max_estado('nivel4_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax4,
        public._dash_matriz_nivel_max_estado('nivel5_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax5,
        public._dash_matriz_nivel_max_estado('nivel6_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax6
    FROM public.so_registros r
    WHERE r.acta_rpo_id IS NOT NULL
),
item_agg AS (
    SELECT
        contrato_id,
        aid,
        it,
        MAX(vu) AS vu,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax1 = 'Aprobado') AS ap_q1,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax2 = 'Aprobado') AS ap_q2,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax3 = 'Aprobado') AS ap_q3,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax4 = 'Aprobado') AS ap_q4,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax5 = 'Aprobado') AS ap_q5,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax6 = 'Aprobado') AS ap_q6
    FROM regs
    WHERE it IS NOT NULL
    GROUP BY contrato_id, aid, it
),
item_cost AS (
    SELECT
        contrato_id,
        aid,
        public.dash_costo_agregado(ap_q1, vu) AS c1,
        public.dash_costo_agregado(ap_q2, vu) AS c2,
        public.dash_costo_agregado(ap_q3, vu) AS c3,
        public.dash_costo_agregado(ap_q4, vu) AS c4,
        public.dash_costo_agregado(ap_q5, vu) AS c5,
        public.dash_costo_agregado(ap_q6, vu) AS c6
    FROM item_agg
)
SELECT
    contrato_id,
    aid AS acta_rpo_id,
    COALESCE(SUM(c1), 0)::numeric AS cobrado_nivel1,
    COALESCE(SUM(c2), 0)::numeric AS cobrado_nivel2,
    COALESCE(SUM(c3), 0)::numeric AS cobrado_nivel3,
    COALESCE(SUM(c4), 0)::numeric AS cobrado_nivel4,
    COALESCE(SUM(c5), 0)::numeric AS cobrado_nivel5,
    COALESCE(SUM(c6), 0)::numeric AS cobrado_nivel6
FROM item_cost
GROUP BY contrato_id, aid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_dashboard_por_acta
    ON public.vm_dashboard_por_acta (contrato_id, acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_dashboard_por_acta_contrato
    ON public.vm_dashboard_por_acta (contrato_id);

REFRESH MATERIALIZED VIEW public.vm_dashboard_resumen;
REFRESH MATERIALIZED VIEW public.vm_dashboard_por_acta;

GRANT SELECT ON public.vm_dashboard_resumen TO authenticated, service_role;
GRANT SELECT ON public.vm_dashboard_por_acta TO authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.vm_dashboard_resumen IS
  'Resumen SICOE por capítulo: cobrado = Σ ítem dash_costo_agregado(Σ cant, V.U.); no SUM(costo_directo).';
