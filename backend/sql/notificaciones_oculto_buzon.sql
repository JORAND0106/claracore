-- Ocultar mensajes solo en el buzón del usuario (no borra la fila para otros).
-- Ejecutar una vez en Supabase SQL Editor.

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS oculto_destinatario BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS oculto_remitente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notif_dest_oculto
  ON notificaciones (destinatario_id, contrato_id)
  WHERE oculto_destinatario = FALSE;
