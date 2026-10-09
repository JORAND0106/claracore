-- Bloqueo breve mientras se agrupan las solicitudes por proveedor.
-- Idempotente. Espejo de migrations/20261009190000_almacen_agrupacion_bloqueo.sql

CREATE TABLE IF NOT EXISTS public.almacen_agrupacion_bloqueo (
  contrato_id integer PRIMARY KEY,
  usuario_id integer,
  solicitud_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.almacen_agrupacion_bloqueo IS
  'Mientras está vigente, otros usuarios no editan las solicitudes listadas.';

NOTIFY pgrst, 'reload schema';
