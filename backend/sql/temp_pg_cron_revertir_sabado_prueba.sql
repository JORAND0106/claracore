-- TEMPORAL — revertir cron a lun–vie tras prueba del sábado 2026-07-18.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'claracore_notificaciones_email' LIMIT 1),
  schedule := '*/5 * * * 1-5'
);
