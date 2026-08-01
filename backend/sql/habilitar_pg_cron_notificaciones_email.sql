-- pg_cron: invocar notificaciones email cada 5 min (todos los días, hora UTC del servidor Supabase).
-- Requisitos previos:
--   • Backend desplegado en Azure con el módulo notificaciones_email.
--   • CLARACORE_CRON_SECRET en Azure App Service (mismo valor que abajo).
--   • SMTP configurado en Azure (CLARACORE_CONTACTO_SMTP_*).
--   • Migraciones notificaciones_email + snapshot periodo aplicadas.
--
-- Nota: el runner filtra por tipo de job:
--   • matriz_snapshot → todos los días (incluye Sáb/Dom para el informe semanal)
--   • admin_resumen_semanal → solo lunes 08:00 America/Bogota
--   • sin_item / validacion_pendiente → lun–vie
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
      '*/5 * * * *',
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
    RAISE NOTICE 'Job claracore_notificaciones_email programado (diario, cada 5 min).';
  END IF;
END;
$cron$;

-- Verificación (opcional, ejecutar después):
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'claracore_notificaciones_email';
