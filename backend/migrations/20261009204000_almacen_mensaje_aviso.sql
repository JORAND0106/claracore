-- Marca, por destinatario, si el aviso interno del mensaje de la solicitud se entregó.
-- Idempotente.

ALTER TABLE public.almacen_solicitud_mensaje_destinatario
  ADD COLUMN IF NOT EXISTS aviso_at timestamptz;

COMMENT ON COLUMN public.almacen_solicitud_mensaje_destinatario.aviso_at IS
  'Cuándo se entregó el aviso dentro de la plataforma. Nulo: el destinatario aún no fue avisado.';

NOTIFY pgrst, 'reload schema';
