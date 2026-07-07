-- ClaraCore — Gestión documental corporativa (módulo Contabilidad)
-- Fase 8a: tabla contabilidad_documento_empresa
-- Ejecutar manualmente en Supabase SQL Editor. Idempotente.
--
-- Documentos corporativos de ClaraCore (RUT, certificados, contratos firmados, etc.)
-- separados de soportes de transacciones. Binarios en claracore-privado.

CREATE TABLE IF NOT EXISTS public.contabilidad_documento_empresa (
  id                  bigserial PRIMARY KEY,
  categoria           text NOT NULL
                      CHECK (categoria IN ('legal', 'tributario', 'corporativo', 'laboral', 'otros')),
  nombre              varchar(200) NOT NULL,
  descripcion         text,
  fecha_documento     date,
  fecha_vencimiento   date,
  azure_blob_path     text NOT NULL,
  nombre_archivo      varchar(255) NOT NULL,
  mime_type           text NOT NULL,
  tamano_bytes        bigint NOT NULL CHECK (tamano_bytes > 0),
  hash_sha256         varchar(64),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at          timestamptz,
  updated_by          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  eliminado_en        timestamptz,
  eliminado_por       integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS contabilidad_doc_empresa_categoria_idx
  ON public.contabilidad_documento_empresa (categoria)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS contabilidad_doc_empresa_vence_idx
  ON public.contabilidad_documento_empresa (fecha_vencimiento)
  WHERE eliminado_en IS NULL AND fecha_vencimiento IS NOT NULL;

CREATE INDEX IF NOT EXISTS contabilidad_doc_empresa_nombre_idx
  ON public.contabilidad_documento_empresa (lower(nombre))
  WHERE eliminado_en IS NULL;

COMMENT ON TABLE public.contabilidad_documento_empresa IS
  'Documentos corporativos de la empresa (legales, tributarios, etc.). Distinto de soportes de transacción.';

COMMENT ON COLUMN public.contabilidad_documento_empresa.categoria IS
  'legal | tributario | corporativo | laboral | otros';
