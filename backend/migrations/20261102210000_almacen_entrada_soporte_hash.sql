-- Anti-duplicados de soportes de entrada (Remisión / foto descargue) por contenido SHA-256.
CREATE TABLE IF NOT EXISTS public.almacen_entrada_soporte_hash (
  id              bigserial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  content_hash    text NOT NULL,
  entrada_id      bigint NOT NULL REFERENCES public.almacen_entrada(id) ON DELETE CASCADE,
  tipo_soporte    text NOT NULL CHECK (tipo_soporte IN ('remision', 'material')),
  codigo_entrada  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_entrada_soporte_hash_uq UNIQUE (contrato_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_soporte_hash_entrada
  ON public.almacen_entrada_soporte_hash (entrada_id);

COMMENT ON TABLE public.almacen_entrada_soporte_hash IS
  'Hash SHA-256 del contenido de remisión/foto descargue para evitar reutilizar el mismo archivo.';

NOTIFY pgrst, 'reload schema';
