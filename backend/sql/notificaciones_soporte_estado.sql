-- Estado de gestión de reportes SOPORTE (panel admin + Telegram).
-- Ejecutar una vez en Supabase SQL Editor (o vía migración).

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS soporte_estado TEXT NULL,
  ADD COLUMN IF NOT EXISTS soporte_gestionado_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS soporte_gestionado_por_nombre TEXT NULL,
  ADD COLUMN IF NOT EXISTS soporte_gestion_origen TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notificaciones_soporte_estado_check'
  ) THEN
    ALTER TABLE notificaciones
      ADD CONSTRAINT notificaciones_soporte_estado_check
      CHECK (soporte_estado IS NULL OR soporte_estado IN ('gestionado', 'anotado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_soporte_estado
  ON notificaciones (tipo, soporte_estado, created_at DESC)
  WHERE tipo = 'SOPORTE';
