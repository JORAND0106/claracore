-- Verificación rápida de rendimiento (ejecutar en Supabase SQL Editor)
-- Si UPDATE tarda < 50 ms y triggers = 0 → la fase 1 SÍ está aplicada.
-- Query Performance del dashboard puede seguir mostrando promedios VIEJOS (histórico acumulado).

-- 1) Triggers de refresco MV (debe ser 0 filas)
SELECT c.relname AS tabla, t.tgname AS trigger
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname IN ('so_registros', 'so_reportes')
  AND t.tgname LIKE 'trg_refresh%'
  AND NOT t.tgisinternal;

-- 2) UPDATE en vivo (debe ser < 50 ms; antes era 3–8 s con triggers)
EXPLAIN (ANALYZE, BUFFERS)
UPDATE public.so_registros
SET observacion = observacion
WHERE id = (SELECT id FROM public.so_registros LIMIT 1);

-- 3) pg_cron (debe existir job claracore_refresh_sicoe_mvs cada 3 min)
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'claracore_refresh_sicoe_mvs';

-- 4) Índices N2–N6 (deben existir)
SELECT indexname
FROM pg_indexes
WHERE tablename = 'so_registros'
  AND indexname LIKE 'idx_so_registros_contrato_nivel%'
ORDER BY 1;

-- 5) Tuplas muertas (si n_dead_tup alto → VACUUM ANALYZE)
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_analyze
FROM pg_stat_user_tables
WHERE relname IN ('so_registros', 'so_reportes');
