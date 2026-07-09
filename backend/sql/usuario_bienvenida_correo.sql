-- Registro de correo de bienvenida al aprobar usuarios.
-- Ejecutar manualmente en Supabase SQL Editor ANTES de desplegar el código de aplicación.
-- Idempotente: seguro re-ejecutar.

-- Columna denormalizada: último envío exitoso de bienvenida
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS bienvenida_enviada_en timestamptz;

COMMENT ON COLUMN public.usuarios.bienvenida_enviada_en IS
  'Fecha/hora UTC del último correo de bienvenida enviado con éxito al aprobar la cuenta.';

-- Historial de intentos de envío (éxito y fallo)
CREATE TABLE IF NOT EXISTS public.usuario_correo_envio (
  id                bigserial PRIMARY KEY,
  usuario_id        integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo              text NOT NULL DEFAULT 'bienvenida'
                      CHECK (tipo IN ('bienvenida')),
  destinatario      text NOT NULL,
  asunto            text,
  exito             boolean NOT NULL DEFAULT false,
  error_detalle     text,
  enviado_at        timestamptz NOT NULL DEFAULT now(),
  enviado_por       integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_usuario_correo_envio_usuario
  ON public.usuario_correo_envio (usuario_id, enviado_at DESC);

CREATE INDEX IF NOT EXISTS idx_usuario_correo_envio_tipo
  ON public.usuario_correo_envio (tipo, enviado_at DESC);

COMMENT ON TABLE public.usuario_correo_envio IS
  'Historial de envíos SMTP transaccionales a usuarios (p. ej. bienvenida al aprobar).';

COMMENT ON COLUMN public.usuario_correo_envio.tipo IS
  'Tipo de correo: bienvenida (extensible a otros tipos en el futuro).';

COMMENT ON COLUMN public.usuario_correo_envio.enviado_por IS
  'Usuario que aprobó la cuenta (Desarrollador/Administrador); NULL si el sistema no pudo resolverlo.';

-- RLS: solo service_role / backend (mismo patrón que otras tablas de auditoría vía service key)
ALTER TABLE public.usuario_correo_envio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuario_correo_envio_service_all ON public.usuario_correo_envio;
-- Sin políticas para anon/authenticated: el acceso es vía backend con service_role.

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'usuarios'
  AND column_name = 'bienvenida_enviada_en'
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'usuario_correo_envio'
ORDER BY ordinal_position;
