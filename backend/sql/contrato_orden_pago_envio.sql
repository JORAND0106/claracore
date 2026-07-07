-- Registro de envíos por correo de órdenes de pago + estado de envío en la orden.
-- Ejecutar en Supabase SQL Editor después de contrato_orden_pago.sql / config_v2.

-- Estado de envío denormalizado en la orden (último intento)
ALTER TABLE public.contrato_orden_pago
  ADD COLUMN IF NOT EXISTS envio_estado text
    CHECK (envio_estado IS NULL OR envio_estado IN ('pendiente', 'enviado', 'fallido')),
  ADD COLUMN IF NOT EXISTS ultimo_envio_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_envio_destinatarios jsonb;

COMMENT ON COLUMN public.contrato_orden_pago.envio_estado IS
  'Estado del último intento de envío por correo: pendiente, enviado, fallido.';

COMMENT ON COLUMN public.contrato_orden_pago.ultimo_envio_destinatarios IS
  'Lista JSON de correos del último envío exitoso o intento fallido.';

-- Mensaje adicional opcional por contrato (cuerpo del correo)
ALTER TABLE public.contrato_licencia_cobro_config
  ADD COLUMN IF NOT EXISTS email_mensaje_adicional text;

COMMENT ON COLUMN public.contrato_licencia_cobro_config.email_mensaje_adicional IS
  'Párrafo opcional incluido en el correo de orden de pago (plantilla estándar + este texto).';

-- Historial de envíos (cada intento, incluidos reenvíos)
CREATE TABLE IF NOT EXISTS public.contrato_orden_pago_envio (
  id                bigserial PRIMARY KEY,
  orden_id          bigint NOT NULL REFERENCES public.contrato_orden_pago(id) ON DELETE CASCADE,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  destinatarios     jsonb NOT NULL DEFAULT '[]'::jsonb,
  asunto            text,
  exito             boolean NOT NULL DEFAULT false,
  error_detalle     text,
  enviado_at        timestamptz NOT NULL DEFAULT now(),
  enviado_por       integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contrato_orden_pago_envio_orden
  ON public.contrato_orden_pago_envio (orden_id, enviado_at DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_orden_pago_envio_contrato
  ON public.contrato_orden_pago_envio (contrato_id, enviado_at DESC);

COMMENT ON TABLE public.contrato_orden_pago_envio IS
  'Historial de envíos SMTP de órdenes de pago (generar+enviar y reenvíos).';

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('contrato_orden_pago', 'contrato_orden_pago_envio', 'contrato_licencia_cobro_config')
  AND column_name IN (
    'envio_estado', 'ultimo_envio_at', 'ultimo_envio_destinatarios',
    'email_mensaje_adicional'
  )
ORDER BY table_name, column_name;
