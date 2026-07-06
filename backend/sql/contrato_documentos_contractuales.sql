-- Documentos contractuales de licenciamiento ClaraCore (gestión documental por contrato).
-- Ejecutar en Supabase SQL Editor una vez.
-- Binarios: contenedor Azure privado claracore-privado (ver azure_blob_storage.py).
-- Acceso API: solo cargo Desarrollador.

-- Estado de gestión documental en el contrato de obra (control interno).
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS doc_contractual_estado text NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS doc_contractual_updated_at timestamptz;

ALTER TABLE public.contratos
  DROP CONSTRAINT IF EXISTS contratos_doc_contractual_estado_check;

ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_doc_contractual_estado_check
  CHECK (doc_contractual_estado IN ('borrador', 'generado', 'enviado', 'firmado'));

COMMENT ON COLUMN public.contratos.doc_contractual_estado IS
  'Estado interno de gestión documental contractual (borrador|generado|enviado|firmado). Solo Desarrollador.';
COMMENT ON COLUMN public.contratos.doc_contractual_updated_at IS
  'Marca de tiempo del último movimiento en el flujo de documentos contractuales.';

-- Datos del licenciatario (independientes de contratista/NIT del contrato de obra).
CREATE TABLE IF NOT EXISTS public.contrato_licencia_licenciatario (
  contrato_id integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  razon_social text,
  nit text,
  representante_nombre text,
  representante_cedula text,
  direccion text,
  email_notificaciones text,
  identificacion_obra text,
  valor_mensual numeric,
  updated_at timestamptz DEFAULT now(),
  updated_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.contrato_licencia_licenciatario IS
  'Datos del licenciatario para contrato de licenciamiento ClaraCore (1:1 con contratos).';

-- Historial inmutable de PDFs generados y documentos firmados cargados.
CREATE TABLE IF NOT EXISTS public.contrato_documento_contractual (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('generado', 'firmado')),
  version_num integer NOT NULL CHECK (version_num >= 1),
  azure_blob_path text NOT NULL,
  nombre_archivo text,
  mime_type text,
  tamano_bytes bigint,
  datos_licenciatario_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contrato_documento_contractual_version_unique
    UNIQUE (contrato_id, tipo, version_num)
);

CREATE INDEX IF NOT EXISTS idx_contrato_doc_contractual_contrato_created
  ON public.contrato_documento_contractual (contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_doc_contractual_contrato_tipo
  ON public.contrato_documento_contractual (contrato_id, tipo, version_num DESC);

COMMENT ON TABLE public.contrato_documento_contractual IS
  'Versiones de PDF generado y documentos firmados; azure_blob_path apunta a claracore-privado.';
