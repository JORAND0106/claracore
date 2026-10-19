-- OC generada sin notificar al comercial del proveedor.
-- Idempotente. Distinto de envio_estado = pendiente (se quiso enviar y faltó el correo o falló).

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS documento_sistema boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.almacen_orden_compra.documento_sistema IS
  'True: documento de sistema, no se notificó al comercial. Al enviarse después pasa a false.';

NOTIFY pgrst, 'reload schema';
