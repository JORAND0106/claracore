-- Bloqueo breve mientras se agrupan las solicitudes por proveedor.
-- Idempotente. La aplica schema_migrations_runner cuando existe SUPABASE_DB_URL.

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
