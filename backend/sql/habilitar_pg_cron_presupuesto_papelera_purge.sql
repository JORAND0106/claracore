-- pg_cron + pg_net: purga diaria de Papelera de presupuesto (>30 días).
--
-- Prerrequisitos:
--   • Extensiones pg_cron y pg_net habilitadas
--   • CLARACORE_CRON_SECRET en Azure App Service
--   • Reemplazar <<<PEGAR_CRON_SECRET>>> por el mismo valor
--   • migration_presupuesto_dado_de_baja_at.sql aplicada
--
-- Schedule: 03:15 America/Bogota ≈ 08:15 UTC (ajuste si DST).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'claracore_presupuesto_papelera_purge';

    PERFORM cron.schedule(
      'claracore_presupuesto_papelera_purge',
      '15 8 * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://claracore-backend.azurewebsites.net/internal/cron/presupuesto-papelera-purge',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', '<<<PEGAR_CRON_SECRET>>>'
        ),
        body := '{}'::jsonb
      );
      $cmd$
    );
  END IF;
END
$cron$;
