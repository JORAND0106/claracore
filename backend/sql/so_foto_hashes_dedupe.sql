-- Huella SHA-256 de fotos SICOE por contrato: evita re-subidas duplicadas.
CREATE TABLE IF NOT EXISTS public.so_foto_hashes (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  foto_url text NOT NULL,
  foto_numero integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_so_foto_hashes_contrato_hash
  ON public.so_foto_hashes (contrato_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_so_foto_hashes_contrato
  ON public.so_foto_hashes (contrato_id);

COMMENT ON TABLE public.so_foto_hashes IS
  'Huella SHA-256 del contenido de fotos SICOE por contrato; evita re-subidas duplicadas.';

GRANT SELECT, INSERT, UPDATE ON public.so_foto_hashes TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.so_foto_hashes_id_seq TO authenticated, service_role;
