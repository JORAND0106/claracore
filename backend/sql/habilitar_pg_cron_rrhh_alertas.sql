-- pg_cron: alertas de vencimiento / período de prueba RRHH (diario 13:00 UTC ≈ 08:00 Bogotá).
-- Requisitos: CLARACORE_CRON_SECRET en Azure App Service.
-- Reemplace SOLO la línea marcada con <<<PEGAR_CRON_SECRET>>>.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'claracore_rrhh_alertas';

    PERFORM cron.schedule(
      'claracore_rrhh_alertas',
      '0 13 * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://claracore-backend.azurewebsites.net/internal/cron/rrhh-alertas/run',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', '<<<PEGAR_CRON_SECRET>>>'
        ),
        body := '{}'::jsonb
      );
      $cmd$
    );
    RAISE NOTICE 'Job claracore_rrhh_alertas programado (diario 13:00 UTC).';
  END IF;
END;
$cron$;
