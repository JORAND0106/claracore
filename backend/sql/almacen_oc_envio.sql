-- Envío del PDF de la orden de compra al correo de la cotización.
-- Idempotente. La aplica schema_migrations_runner cuando existe SUPABASE_DB_URL.

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS envio_estado text;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS envio_correo text;

COMMENT ON COLUMN public.almacen_orden_compra.envio_estado IS
  'enviado o pendiente. Pendiente: sin correo en la cotización o falló el envío.';

CREATE TABLE IF NOT EXISTS public.almacen_orden_compra_envio (
  id bigserial PRIMARY KEY,
  orden_compra_id bigint NOT NULL,
  contrato_id bigint NOT NULL,
  destinatario text,
  disparado_por bigint,
  disparado_por_nombre text,
  resultado text NOT NULL,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS almacen_orden_compra_envio_oc_idx
  ON public.almacen_orden_compra_envio (orden_compra_id, created_at);

NOTIFY pgrst, 'reload schema';
