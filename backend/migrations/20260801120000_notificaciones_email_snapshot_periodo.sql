-- Extiende snapshots de matriz validación: apertura + cierre por día
-- (alimenta el informe semanal consolidado).

ALTER TABLE public.notificaciones_email_resumen_snapshot
  ADD COLUMN IF NOT EXISTS periodo text NOT NULL DEFAULT 'apertura';

-- Migrar filas legacy (sin periodo explícito) quedan como 'apertura' por DEFAULT.

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
