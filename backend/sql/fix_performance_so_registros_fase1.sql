-- ClaraCore — Fase 1 rendimiento so_registros (Supabase SQL Editor)
--
-- Diagnóstico confirmado:
--   • 4 triggers en so_registros/so_reportes refrescan MVs en CADA INSERT/UPDATE/DELETE.
--   • Un solo UPDATE dispara hasta 4 REFRESH MATERIALIZED VIEW (3–8 s c/u).
--   • Índices duplicados en so_registros penalizan cada escritura.
--
-- Cuándo ejecutar: horario de poca carga (noche / fin de semana).
-- El SQL Editor envuelve en transacción: no uses CONCURRENTLY aquí.
--
-- Orden: 1 → 2 → 3 → 4 → 5 (verificar con queries al final).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quitar índices redundantes (Advisor: Duplicate Index)
--    Conservamos el UNIQUE de negocio y los nombres idx_so_registros_contrato_*
-- ═══════════════════════════════════════════════════════════════════════════

-- (contrato_id, numero_registro): ya cubierto por UNIQUE constraint
DROP INDEX IF EXISTS public.idx_so_registros_contrato_numreg;
DROP INDEX IF EXISTS public.idx_so_registros_contrato_numero;

-- (contrato_id, semana_id): duplicado exacto
DROP INDEX IF EXISTS public.idx_so_registros_semana_contrato;

-- (contrato_id, acta_rpo_id) + mismo WHERE parcial que matriz
DROP INDEX IF EXISTS public.idx_so_registros_rpo_panel_cascade;

-- (contrato_id, nivel3_estado): duplicado; tras index_so_registros_niveles_n4_n6.sql
-- queda idx_so_registros_contrato_nivel3
DROP INDEX IF EXISTS public.idx_so_registros_nivel3;
DROP INDEX IF EXISTS public.idx_so_registros_nivel3_contrato;

-- (contrato_id, capitulo): duplicado exacto
DROP INDEX IF EXISTS public.idx_so_registros_capitulo;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Desactivar triggers síncronos de refresco de MV
--    (causa principal de UPDATEs lentos y slow queries)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_refresh_dashboard ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_grilla_registros ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_registro_detalle ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_grilla_reportes ON public.so_reportes;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Función única para refrescar todas las MV SICOE (manual o cron)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_all_sicoe_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_grilla;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_registro_detalle;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_resumen;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_por_acta;
END;
$$;

COMMENT ON FUNCTION public.refresh_all_sicoe_materialized_views() IS
  'Refresco batch de MVs SICOE/dashboard. Sustituye triggers por fila (fix_performance fase 1).';

-- Refresco inmediato tras quitar triggers (puede tardar 1–3 min en contratos grandes)
SELECT public.refresh_all_sicoe_materialized_views();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. pg_cron: refresco cada 3 minutos (requiere extensión pg_cron habilitada)
--    Dashboard → Database → Extensions → pg_cron → Enable
--    Si cron.schedule falla, omitir este bloque y programar refresco manual/off-hours.
-- ═══════════════════════════════════════════════════════════════════════════

DO $cron$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'claracore_refresh_sicoe_mvs';

        PERFORM cron.schedule(
            'claracore_refresh_sicoe_mvs',
            '*/3 * * * *',
            $$SELECT public.refresh_all_sicoe_materialized_views();$$
        );
        RAISE NOTICE 'pg_cron: job claracore_refresh_sicoe_mvs cada 3 min.';
    ELSE
        RAISE NOTICE 'pg_cron no habilitado: habilitar extensión o refrescar MVs manualmente.';
    END IF;
END;
$cron$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Estadísticas para el planner
-- ═══════════════════════════════════════════════════════════════════════════

ANALYZE public.so_registros;
ANALYZE public.so_reportes;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar aparte tras el script)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- -- Triggers (debe devolver 0 filas en so_registros / so_reportes):
-- SELECT c.relname, t.tgname
-- FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname IN ('so_registros', 'so_reportes')
--   AND t.tgname LIKE 'trg_refresh%'
--   AND NOT t.tgisinternal;
--
-- -- Índices nivel 2–6 (deben existir tras index_so_registros_niveles_n4_n6.sql):
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'so_registros'
--   AND indexname LIKE 'idx_so_registros_contrato_nivel%'
-- ORDER BY 1;
--
-- -- Probar UPDATE (debe ser < 100 ms; antes 3–8 s):
-- EXPLAIN ANALYZE
-- UPDATE so_registros SET updated_at = now() WHERE id = (SELECT id FROM so_registros LIMIT 1);
