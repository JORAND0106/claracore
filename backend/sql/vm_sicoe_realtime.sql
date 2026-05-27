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
    r.id, r.numero_reporte, r.capitulo, r.tramo, r.calzada,
    r.abs_inicio, r.abs_final, r.nodo_ini, r.nodo_fin,
    r.subcontratista_id, r.acta_rpo_id, r.semana_id, r.estado, r.contrato_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_sicoe_grilla_id ON public.vm_sicoe_grilla (id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato ON public.vm_sicoe_grilla (contrato_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_acta ON public.vm_sicoe_grilla (acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato_acta ON public.vm_sicoe_grilla (contrato_id, acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_contrato_semana ON public.vm_sicoe_grilla (contrato_id, semana_id);
CREATE INDEX IF NOT EXISTS idx_vm_sicoe_grilla_num_rep ON public.vm_sicoe_grilla (contrato_id, numero_reporte DESC);

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

-- ── 3. Vista dashboard por capítulo (SICOE obra; presupuesto sigue en RPC/vista) ─
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
        r.costo_directo::numeric AS cd,
        r.acta_rpo_id AS aid,
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
)
SELECT
    contrato_id,
    capitulo,
    COUNT(*)::bigint AS total_registros,
    COALESCE(SUM(cd), 0)::numeric AS total_costo,
    COALESCE(SUM(cd) FILTER (WHERE nmax1 = 'Aprobado'), 0)::numeric AS cobrado_nivel1,
    COALESCE(SUM(cd) FILTER (WHERE nmax2 = 'Aprobado'), 0)::numeric AS cobrado_nivel2,
    COALESCE(SUM(cd) FILTER (WHERE nmax3 = 'Aprobado'), 0)::numeric AS cobrado_nivel3,
    COALESCE(SUM(cd) FILTER (WHERE nmax4 = 'Aprobado'), 0)::numeric AS cobrado_nivel4,
    COALESCE(SUM(cd) FILTER (WHERE nmax5 = 'Aprobado'), 0)::numeric AS cobrado_nivel5,
    COALESCE(SUM(cd) FILTER (WHERE nmax6 = 'Aprobado'), 0)::numeric AS cobrado_nivel6,
    COALESCE(SUM(cd) FILTER (WHERE has_item AND nmax3 = 'No Revisado'), 0)::numeric AS no_revisado_nivel3,
    COALESCE(SUM(cd) FILTER (WHERE has_item AND nmax4 = 'No Revisado'), 0)::numeric AS no_revisado_nivel4,
    COALESCE(SUM(cd) FILTER (WHERE has_item AND nmax5 = 'No Revisado'), 0)::numeric AS no_revisado_nivel5,
    COALESCE(SUM(cd) FILTER (WHERE has_item AND nmax6 = 'No Revisado'), 0)::numeric AS no_revisado_nivel6
FROM regs
GROUP BY contrato_id, capitulo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_dashboard_resumen_cap
    ON public.vm_dashboard_resumen (contrato_id, capitulo);
CREATE INDEX IF NOT EXISTS idx_vm_dashboard_resumen_contrato
    ON public.vm_dashboard_resumen (contrato_id);

-- ── 3b. Cobro SICOE aprobado por acta RPO (panel Obra por Acta) ─────────────
DROP MATERIALIZED VIEW IF EXISTS public.vm_dashboard_por_acta CASCADE;

CREATE MATERIALIZED VIEW public.vm_dashboard_por_acta AS
WITH regs AS (
    SELECT
        r.contrato_id,
        r.acta_rpo_id AS aid,
        r.costo_directo::numeric AS cd,
        public._dash_matriz_nivel_max_estado('nivel1_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax1,
        public._dash_matriz_nivel_max_estado('nivel2_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax2,
        public._dash_matriz_nivel_max_estado('nivel3_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax3,
        public._dash_matriz_nivel_max_estado('nivel4_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax4,
        public._dash_matriz_nivel_max_estado('nivel5_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax5,
        public._dash_matriz_nivel_max_estado('nivel6_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax6
    FROM public.so_registros r
    WHERE r.acta_rpo_id IS NOT NULL
)
SELECT
    contrato_id,
    aid AS acta_rpo_id,
    COALESCE(SUM(cd) FILTER (WHERE nmax1 = 'Aprobado'), 0)::numeric AS cobrado_nivel1,
    COALESCE(SUM(cd) FILTER (WHERE nmax2 = 'Aprobado'), 0)::numeric AS cobrado_nivel2,
    COALESCE(SUM(cd) FILTER (WHERE nmax3 = 'Aprobado'), 0)::numeric AS cobrado_nivel3,
    COALESCE(SUM(cd) FILTER (WHERE nmax4 = 'Aprobado'), 0)::numeric AS cobrado_nivel4,
    COALESCE(SUM(cd) FILTER (WHERE nmax5 = 'Aprobado'), 0)::numeric AS cobrado_nivel5,
    COALESCE(SUM(cd) FILTER (WHERE nmax6 = 'Aprobado'), 0)::numeric AS cobrado_nivel6
FROM regs
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

DROP TRIGGER IF EXISTS trg_refresh_grilla_reportes ON public.so_reportes;
CREATE TRIGGER trg_refresh_grilla_reportes
    AFTER INSERT OR UPDATE OR DELETE ON public.so_reportes
    FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_vm_sicoe_grilla();

DROP TRIGGER IF EXISTS trg_refresh_grilla_registros ON public.so_registros;
CREATE TRIGGER trg_refresh_grilla_registros
    AFTER INSERT OR UPDATE OR DELETE ON public.so_registros
    FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_vm_sicoe_grilla();

DROP TRIGGER IF EXISTS trg_refresh_registro_detalle ON public.so_registros;
CREATE TRIGGER trg_refresh_registro_detalle
    AFTER INSERT OR UPDATE OR DELETE ON public.so_registros
    FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_vm_sicoe_registro_detalle();

DROP TRIGGER IF EXISTS trg_refresh_dashboard ON public.so_registros;
CREATE TRIGGER trg_refresh_dashboard
    AFTER INSERT OR UPDATE OR DELETE ON public.so_registros
    FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_vm_dashboard_resumen();

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
-- El front escucha so_reportes / so_registros; los triggers refrescan las MV y el API lee las MV.
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
COMMENT ON MATERIALIZED VIEW public.vm_dashboard_resumen IS 'Resumen SICOE por capítulo; evita RPC pesado en dashboard-resumen.';
