-- Cupo de «Dibujar con IA» por documento/registro (1 generación + 2 ajustes).

CREATE TABLE IF NOT EXISTS public.esquema_ia_uso (
  id            bigserial PRIMARY KEY,
  usuario_id    integer NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  contrato_id   integer REFERENCES public.contratos (id) ON DELETE CASCADE,
  ambito        text NOT NULL,
  doc_key       text NOT NULL,
  usos          integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_esquema_ia_uso_usos CHECK (usos >= 0 AND usos <= 20),
  CONSTRAINT uq_esquema_ia_uso UNIQUE (usuario_id, contrato_id, ambito, doc_key)
);

CREATE INDEX IF NOT EXISTS idx_esquema_ia_uso_doc
  ON public.esquema_ia_uso (contrato_id, ambito, doc_key);

COMMENT ON TABLE public.esquema_ia_uso IS
  'Usos de generación/ajuste de esquema con IA. Máx. 3 por documento (1 inicial + 2 ajustes).';

ALTER TABLE public.esquema_ia_uso ENABLE ROW LEVEL SECURITY;
