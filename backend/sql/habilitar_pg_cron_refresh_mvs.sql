-- Habilitar refresco automático de MVs SICOE/dashboard (cada 3 min)
-- Requiere: fix_performance_so_registros_fase1.sql ya aplicado (triggers quitados).
--
-- Supabase: Database → Extensions → pg_cron → Enable (si CREATE EXTENSION falla).

CREATE EXTENSION IF NOT EXISTS pg_cron;

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
    RAISE NOTICE 'Job claracore_refresh_sicoe_mvs programado cada 3 min.';
  ELSE
    RAISE NOTICE 'pg_cron no disponible: habilitar extensión en el dashboard.';
  END IF;
END;
$cron$;

-- Verificar
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'claracore_refresh_sicoe_mvs';
