-- pg_cron: invocar notificaciones email cada 5 min (lun–vie, hora UTC del servidor Supabase).
-- Requisitos previos:
--   • Backend desplegado en Azure con el módulo notificaciones_email.
--   • CLARACORE_CRON_SECRET en Azure App Service (mismo valor que abajo).
--   • SMTP configurado en Azure (CLARACORE_CONTACTO_SMTP_*).
--   • Migración 20260718230000_notificaciones_email.sql ya aplicada.
--
-- INSTRUCCIÓN: reemplace SOLO la línea marcada con <<<PEGAR_CRON_SECRET>>>
-- por el valor exacto de CLARACORE_CRON_SECRET configurado en Azure.
-- No modifique ninguna otra parte de este script.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'claracore_notificaciones_email';

    PERFORM cron.schedule(
      'claracore_notificaciones_email',
      '*/5 * * * 1-5',
      $cmd$
      SELECT net.http_post(
        url := 'https://claracore-backend.azurewebsites.net/internal/cron/notificaciones-email/run',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', '<<<PEGAR_CRON_SECRET>>>'
        ),
        body := '{}'::jsonb
      );
      $cmd$
    );
    RAISE NOTICE 'Job claracore_notificaciones_email programado (lun–vie, cada 5 min).';
  END IF;
END;
$cron$;

-- Verificación (opcional, ejecutar después):
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'claracore_notificaciones_email';
