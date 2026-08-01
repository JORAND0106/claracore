-- =============================================================================
-- OPS post-PR #82 — ejecutar en Supabase → SQL Editor → Run
-- Orden: (1) migración periodo  (2) pg_cron diario  (3) verificación
-- =============================================================================
-- Requisitos:
--   • Backend ya desplegado en Azure (merge #82 → Deploy backend on push OK).
--   • Reemplazar <<<PEGAR_CRON_SECRET>>> por el valor de CLARACORE_CRON_SECRET
--     (Azure App Service claracore-backend → Configuración → Application settings).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Migración: columna periodo (apertura/cierre) en snapshots
-- -----------------------------------------------------------------------------
ALTER TABLE public.notificaciones_email_resumen_snapshot
  ADD COLUMN IF NOT EXISTS periodo text NOT NULL DEFAULT 'apertura';

ALTER TABLE public.notificaciones_email_resumen_snapshot
  DROP CONSTRAINT IF EXISTS notificaciones_email_resumen_snapshot_unique;

ALTER TABLE public.notificaciones_email_resumen_snapshot
  ADD CONSTRAINT notificaciones_email_resumen_snapshot_unique
    UNIQUE (contrato_id, fecha, periodo);

COMMENT ON COLUMN public.notificaciones_email_resumen_snapshot.periodo IS
  'apertura (9:00) o cierre (18:00) de la jornada; usado por el informe semanal.';

COMMENT ON TABLE public.notificaciones_email_resumen_snapshot IS
  'Snapshots de matriz validación y Ppto vs Cobro (apertura/cierre diario) para el informe semanal.';

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 2) pg_cron: invocar el backend cada 5 min TODOS los días (incluye Sáb/Dom)
--    El runner en Azure filtra: snapshot diario; semanal solo lunes; resto lun–vie.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3) Verificación inmediata (ejecutar y revisar resultados)
-- -----------------------------------------------------------------------------

-- 3a) ¿Existe la columna periodo?
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notificaciones_email_resumen_snapshot'
  AND column_name = 'periodo';

-- 3b) ¿pg_cron quedó en diario (*/5 * * * *) y no solo lun–vie (*/5 * * * 1-5)?
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'claracore_notificaciones_email';

-- 3c) Snapshots recientes (tras 9:00 / 18:00 America/Bogota del día)
SELECT contrato_id, fecha, periodo, captured_at
FROM public.notificaciones_email_resumen_snapshot
ORDER BY captured_at DESC NULLS LAST, fecha DESC
LIMIT 20;

-- 3d) Conteos por periodo (útil tras el primer día de snapshots nuevos)
SELECT periodo, count(*) AS n, max(fecha) AS ultima_fecha
FROM public.notificaciones_email_resumen_snapshot
GROUP BY periodo
ORDER BY periodo;
