-- Web Push: suscripciones por usuario/dispositivo + auditoría de envíos programados.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            bigserial PRIMARY KEY,
  usuario_id    integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth_key      text NOT NULL,
  user_agent    text,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario_activo
  ON public.push_subscriptions (usuario_id) WHERE activo = true;

COMMENT ON TABLE public.push_subscriptions IS
  'Suscripciones Web Push del navegador (una fila por endpoint/dispositivo).';

CREATE TABLE IF NOT EXISTS public.notificaciones_push_envio (
  id            bigserial PRIMARY KEY,
  tipo          text NOT NULL,
  slot_key      text NOT NULL,
  usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  contrato_id   integer REFERENCES public.contratos(id) ON DELETE SET NULL,
  destinatario  text,
  exito         boolean NOT NULL DEFAULT false,
  error_detalle text,
  meta          jsonb,
  enviado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_push_envio_unique
    UNIQUE (tipo, slot_key, usuario_id, contrato_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_push_envio_tipo_slot
  ON public.notificaciones_push_envio (tipo, slot_key, enviado_at DESC);

COMMENT ON TABLE public.notificaciones_push_envio IS
  'Registro de envíos Web Push automáticos. Evita duplicados por ventana (paralelo a email).';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_push_envio ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
