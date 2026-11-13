-- Grilla Por reporte: orden por fecha de creación + número.
-- Recrea vm_sicoe_grilla incluyendo so_reportes.created_at.

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

REFRESH MATERIALIZED VIEW public.vm_sicoe_grilla;

GRANT SELECT ON public.vm_sicoe_grilla TO authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.vm_sicoe_grilla IS
    'Grilla SICOE Obra: agregados por reporte + created_at para orden reciente; API /reportes/buscar.';
