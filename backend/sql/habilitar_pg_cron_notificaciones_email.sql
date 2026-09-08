-- pg_cron: invocar notificaciones email cada 5 min (todos los días, hora UTC del servidor Supabase).
-- Requisitos previos:
--   • Backend desplegado en Azure con el módulo notificaciones_email.
--   • CLARACORE_CRON_SECRET en Azure App Service (mismo valor que abajo).
--   • Migraciones notificaciones_email + snapshot periodo aplicadas.
--
-- IMPORTANTE (2026-09): el envío SMTP de notificaciones está DESACTIVADO en código
-- (NOTIFICACIONES_EMAIL_ENVIO_ACTIVO = False en notificaciones_email_mail.py).
-- Este cron DEBE seguir activo: genera snapshots en
-- notificaciones_email_resumen_snapshot (apertura/cierre). No envía correos.
--
-- Nota: el runner filtra por tipo de job:
--   • matriz_snapshot → todos los días (incluye Sáb/Dom); sin correo
--   • admin_resumen_semanal / sin_item / validacion_pendiente → omitidos mientras
--     el kill-switch SMTP esté en False (y no haya Web Push)
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
