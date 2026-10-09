-- Espejo de backend/migrations/20261009204000_almacen_mensaje_aviso.sql

ALTER TABLE public.almacen_solicitud_mensaje_destinatario
  ADD COLUMN IF NOT EXISTS aviso_at timestamptz;

NOTIFY pgrst, 'reload schema';
