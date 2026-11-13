-- Vistas materializadas SICOE + Realtime (Supabase).
-- Ejecutar en SQL Editor DESPUÉS de dashboard_drill_agg.sql y dashboard_resumen_sicoe.sql
-- (requiere _dash_matriz_nivel_max_estado, _dash_norm_capitulo_key, _norm_estado_matriz).
-- Idempotente donde es posible.

-- ── 1. Vista grilla (cabecera reporte + agregados de líneas) ─────────────────
DROP MATERIALIZED VIEW IF EXISTS public.vm_sicoe_grilla CASCADE;

CREATE MATERIALIZED VIEW public.vm_sicoe_grilla AS
SELECT
    r.id,
    r.numero_reporte,
    r.created_at,
    r.capitulo,
    r.tramo,
    r.calzada AS costado,
    r.abs_inicio,
    r.abs_final,
    r.nodo_ini,
    r.nodo_fin,
    r.subcontratista_id,
    r.acta_rpo_id,
    r.semana_id,
    r.estado,
    r.contrato_id,
    COUNT(reg.id)::bigint AS total_registros,
    COALESCE(SUM(reg.costo_directo), 0)::numeric AS costo_directo_total
FROM public.so_reportes r
LEFT JOIN public.so_registros reg ON reg.reporte_id = r.id
GROUP BY
    r.id, r.numero_reporte, r.created_at, r.capitulo, r.tramo, r.calzada,
    r.abs_inicio, r.abs_final, r.nodo_ini, r.nodo_fin,
    r.subcontratista_id, r.acta_rpo_id, r.semana_id, r.estado, r.contrato_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_sicoe_grilla_id ON public.vm_sicoe_grilla (id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato ON public.vm_sicoe_grilla (contrato_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_acta ON public.vm_sicoe_grilla (acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato_acta ON public.vm_sicoe_grilla (contrato_id, acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato_semana ON public.vm_sicoe_grilla (contrato_id, semana_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_num_rep ON public.vm_sicoe_grilla (contrato_id, numero_reporte DESC);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato_created
    ON public.vm_sicoe_grilla (contrato_id, created_at DESC NULLS LAST, numero_reporte DESC);

-- ── 2. Vista detalle registro (Realtime carpeta abierta) ───────────────────
DROP MATERIALIZED VIEW IF EXISTS public.vm_sicoe_registro_detalle CASCADE;

CREATE MATERIALIZED VIEW public.vm_sicoe_registro_detalle AS
SELECT
    id,
    numero_registro,
    reporte_id,
    contrato_id,
    capitulo,
    item_numero,
    item_descripcion,
    unidad,
    vlr_unitario,
    ancho,
    espesor,
    cantidad_total,
    costo_directo,
    observacion,
    abs_inicio,
    abs_final,
    nodo_ini,
    nodo_fin,
    foto_url,
    foto_numero,
    grafico_url,
    nivel1_estado,
    nivel2_estado,
    nivel3_estado,
    nivel4_estado,
    nivel5_estado,
    nivel6_estado
FROM public.so_registros;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_sicoe_registro_detalle_id ON public.vm_sicoe_registro_detalle (id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_registro_detalle_reporte ON public.vm_sicoe_registro_detalle (reporte_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_registro_detalle_contrato ON public.vm_sicoe_registro_detalle (contrato_id);

-- ── 3. Vista dashboard por capítulo (SICOE obra; cobrado = Σ cant×VU por ítem) ─
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
        public.dash_costo_agregado(ap_q1, public._dash_listado_vu(contrato_id, capitulo, it)) AS c1,
        public.dash_costo_agregado(ap_q2, public._dash_listado_vu(contrato_id, capitulo, it)) AS c2,
        public.dash_costo_agregado(ap_q3, public._dash_listado_vu(contrato_id, capitulo, it)) AS c3,
        public.dash_costo_agregado(ap_q4, public._dash_listado_vu(contrato_id, capitulo, it)) AS c4,
        public.dash_costo_agregado(ap_q5, public._dash_listado_vu(contrato_id, capitulo, it)) AS c5,
        public.dash_costo_agregado(ap_q6, public._dash_listado_vu(contrato_id, capitulo, it)) AS c6,
        public.dash_costo_agregado(nr_q3, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr3,
        public.dash_costo_agregado(nr_q4, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr4,
        public.dash_costo_agregado(nr_q5, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr5,
        public.dash_costo_agregado(nr_q6, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr6
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

-- ── 3b. Cobro SICOE aprobado por acta RPO (panel Obra por Acta) ─────────────
CREATE MATERIALIZED VIEW public.vm_dashboard_por_acta AS
WITH regs AS (
    SELECT
        r.contrato_id,
        r.acta_rpo_id AS aid,
        public._dash_norm_capitulo_key(
            CASE
                WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capítulo'
                ELSE r.capitulo::text
            END
        ) AS cap,
        public._dash_norm_item_key(r.item_numero) AS it,
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
        cap,
        it,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax1 = 'Aprobado') AS ap_q1,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax2 = 'Aprobado') AS ap_q2,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax3 = 'Aprobado') AS ap_q3,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax4 = 'Aprobado') AS ap_q4,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax5 = 'Aprobado') AS ap_q5,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax6 = 'Aprobado') AS ap_q6
    FROM regs
    WHERE it IS NOT NULL
    GROUP BY contrato_id, aid, cap, it
),
item_cost AS (
    SELECT
        contrato_id,
        aid,
        public.dash_costo_agregado(ap_q1, public._dash_listado_vu(contrato_id, cap, it)) AS c1,
        public.dash_costo_agregado(ap_q2, public._dash_listado_vu(contrato_id, cap, it)) AS c2,
        public.dash_costo_agregado(ap_q3, public._dash_listado_vu(contrato_id, cap, it)) AS c3,
        public.dash_costo_agregado(ap_q4, public._dash_listado_vu(contrato_id, cap, it)) AS c4,
        public.dash_costo_agregado(ap_q5, public._dash_listado_vu(contrato_id, cap, it)) AS c5,
        public.dash_costo_agregado(ap_q6, public._dash_listado_vu(contrato_id, cap, it)) AS c6
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

-- ── 4. Refresco (CONCURRENTLY requiere índices UNIQUE arriba) ───────────────
CREATE OR REPLACE FUNCTION public.refresh_vm_sicoe_grilla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_grilla;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_vm_sicoe_registro_detalle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_registro_detalle;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_vm_dashboard_resumen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_resumen;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_por_acta;
    RETURN NULL;
END;
$$;

-- Triggers síncronos desactivados: cada INSERT/UPDATE/DELETE refrescaba hasta 4 MV (~3–8 s c/u).
-- Refresco batch vía refresh_all_sicoe_materialized_views() + pg_cron (fix_performance_so_registros_fase1.sql).
DROP TRIGGER IF EXISTS trg_refresh_grilla_reportes ON public.so_reportes;
DROP TRIGGER IF EXISTS trg_refresh_grilla_registros ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_registro_detalle ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_dashboard ON public.so_registros;

-- Carga inicial
REFRESH MATERIALIZED VIEW public.vm_sicoe_registro_detalle;
REFRESH MATERIALIZED VIEW public.vm_sicoe_grilla;
REFRESH MATERIALIZED VIEW public.vm_dashboard_resumen;
REFRESH MATERIALIZED VIEW public.vm_dashboard_por_acta;

GRANT SELECT ON public.vm_sicoe_grilla TO authenticated, service_role;
GRANT SELECT ON public.vm_sicoe_registro_detalle TO authenticated, service_role;
GRANT SELECT ON public.vm_dashboard_resumen TO authenticated, service_role;
GRANT SELECT ON public.vm_dashboard_por_acta TO authenticated, service_role;

-- ── 5. Realtime publication ────────────────────────────────────────────────
-- Postgres NO admite materialized views en supabase_realtime.
-- El front escucha so_reportes / so_registros; las MV se refrescan por cron (no por trigger síncrono).
-- Ver backend/sql/realtime_publication_tables.sql

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cad_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON MATERIALIZED VIEW public.vm_sicoe_grilla IS 'Grilla SICOE Obra: agregados por reporte; Realtime + API /reportes/buscar.';
COMMENT ON MATERIALIZED VIEW public.vm_sicoe_registro_detalle IS 'Detalle registro para Realtime carpeta abierta.';
COMMENT ON MATERIALIZED VIEW public.vm_dashboard_resumen IS 'Resumen SICOE por capítulo: cobrado = Σ ítem dash_costo_agregado(Σ cant, V.U.); no SUM(costo_directo).';
