-- Unidades creadas desde «Otra unidad» en el catálogo de insumos.
-- Idempotente. La aplica schema_migrations_runner cuando existe SUPABASE_DB_URL.
-- El listado fijo sigue en el código; aquí solo se agregan las unidades nuevas del contrato.

CREATE TABLE IF NOT EXISTS public.catalogo_unidad (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL,
  nombre text NOT NULL,
  clave text NOT NULL,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_unidad_contrato_clave_uq UNIQUE (contrato_id, clave)
);

CREATE INDEX IF NOT EXISTS catalogo_unidad_contrato_idx
  ON public.catalogo_unidad (contrato_id, nombre);

COMMENT ON TABLE public.catalogo_unidad IS
  'Unidades de medida creadas en el catálogo de insumos. clave ignora mayúsculas, tildes y espacios sobrantes.';

GRANT SELECT, INSERT ON TABLE public.catalogo_unidad TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.catalogo_unidad_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
