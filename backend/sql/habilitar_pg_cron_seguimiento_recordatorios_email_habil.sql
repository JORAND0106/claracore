-- pg_cron: recordatorio email Seguimiento (día hábil anterior, 15:30 Bogotá).
-- Dispara cada 5 min; el backend solo envía en ventana 15:30–15:35 America/Bogotá
-- y solo en días hábiles (sin sáb/dom/festivos CO). Idempotencia evita duplicados.
--
-- Requisitos:
--   • Backend con POST /seguimiento/internal/cron/recordatorios-email-habil
--   • CRON_SECRET o INTERNAL_CRON_SECRET / CLARACORE_CRON_SECRET (= X-Cron-Secret)
--   • SMTP contacto configurado (CLARACORE_CONTACTO_SMTP_*)
--
-- INSTRUCCIÓN: reemplace <<<PEGAR_CRON_SECRET>>> y, si aplica, la URL del backend.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'claracore_seguimiento_recordatorios_email_habil';

    PERFORM cron.schedule(
      'claracore_seguimiento_recordatorios_email_habil',
      '*/5 * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://claracore-backend.azurewebsites.net/seguimiento/internal/cron/recordatorios-email-habil',
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
