-- pg_cron: recordatorios de reunión Seguimiento (día anterior + mismo día).
-- Dispara cada hora; el backend solo envía entre 06:00–09:59 America/Bogotá
-- (ventana centrada en ≈07:00) e idempotencia evita duplicados.
--
-- Requisitos:
--   • Backend con POST /seguimiento/internal/cron/recordatorios-reunion
--   • CRON_SECRET o INTERNAL_CRON_SECRET en Azure (= X-Cron-Secret)
--
-- INSTRUCCIÓN: reemplace <<<PEGAR_CRON_SECRET>>> y, si aplica, la URL del backend.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'claracore_seguimiento_recordatorios_reunion';

    PERFORM cron.schedule(
      'claracore_seguimiento_recordatorios_reunion',
      '5 * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://claracore-backend.azurewebsites.net/seguimiento/internal/cron/recordatorios-reunion',
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
