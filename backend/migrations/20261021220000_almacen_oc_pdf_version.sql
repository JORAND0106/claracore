-- Versiones del PDF de la orden de compra.
-- La vigente sigue en almacen_orden_compra.pdf_blob_path.
-- Idempotente. Pegar este archivo completo en el SQL Editor de Supabase
-- si el backend no tiene SUPABASE_DB_URL: sin esta tabla, Regenerar PDF
-- responde que no pudo consultar las versiones y no reemplaza nada.
-- La aplica schema_migrations_runner cuando existe SUPABASE_DB_URL.

CREATE TABLE IF NOT EXISTS public.almacen_orden_compra_pdf (
  id bigserial PRIMARY KEY,
  orden_compra_id bigint NOT NULL,
  contrato_id bigint NOT NULL,
  version integer NOT NULL,
  vigente boolean NOT NULL DEFAULT false,
  blob_path text NOT NULL,
  nombre text,
  creado_por integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  reemplaza_version integer,
  reenviado boolean NOT NULL DEFAULT false,
  CONSTRAINT almacen_orden_compra_pdf_version_uq UNIQUE (orden_compra_id, version)
);

CREATE INDEX IF NOT EXISTS almacen_orden_compra_pdf_oc_idx
  ON public.almacen_orden_compra_pdf (orden_compra_id, version);

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS pdf_version integer;

ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS pdf_proveedor_desactualizado boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.almacen_orden_compra_pdf IS
  'Historial del PDF de la OC. vigente=false es una versión anterior; no se borra al regenerar.';

COMMENT ON COLUMN public.almacen_orden_compra.pdf_proveedor_desactualizado IS
  'True: el PDF vigente cambió y el proveedor todavía tiene la versión anterior.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.almacen_orden_compra_pdf TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.almacen_orden_compra_pdf_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
