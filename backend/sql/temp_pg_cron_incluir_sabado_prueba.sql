-- TEMPORAL — prueba sábado 2026-07-18 (resumen admin 23:22 Bogotá).
-- Extiende pg_cron para incluir sábados. ELIMINAR tras la prueba ejecutando
-- temp_pg_cron_revertir_sabado_prueba.sql

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'claracore_notificaciones_email' LIMIT 1),
  schedule := '*/5 * * * 1-6'
);

-- Verificación:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'claracore_notificaciones_email';
