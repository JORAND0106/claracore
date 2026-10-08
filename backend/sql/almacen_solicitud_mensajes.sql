-- ClaraCore — Almacén: justificación con autor y buzón de la solicitud.
-- Idempotente. El backend omite columnas ausentes y el listado sigue si las tablas no existen.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS justificacion_autor_id bigint;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS justificacion_autor_nombre text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS justificacion_at timestamptz;

CREATE TABLE IF NOT EXISTS public.almacen_solicitud_mensaje (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL,
  solicitud_id bigint NOT NULL,
  solicitud_item_id bigint,
  linea_numero integer,
  linea_etiqueta text,
  remitente_id bigint NOT NULL,
  remitente_nombre text,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS almacen_solicitud_mensaje_solicitud_idx
  ON public.almacen_solicitud_mensaje (solicitud_id, created_at);

CREATE TABLE IF NOT EXISTS public.almacen_solicitud_mensaje_destinatario (
  id bigserial PRIMARY KEY,
  mensaje_id bigint NOT NULL REFERENCES public.almacen_solicitud_mensaje(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL,
  solicitud_id bigint NOT NULL,
  destinatario_id bigint NOT NULL,
  destinatario_nombre text,
  leido_at timestamptz,
  UNIQUE (mensaje_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS almacen_solicitud_mensaje_no_leido_idx
  ON public.almacen_solicitud_mensaje_destinatario (destinatario_id, contrato_id, solicitud_id)
  WHERE leido_at IS NULL;

NOTIFY pgrst, 'reload schema';
