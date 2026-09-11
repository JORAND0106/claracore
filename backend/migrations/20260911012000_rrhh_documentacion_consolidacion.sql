-- ClaraCore — RRHH: consolidación Documentación (bancarios, validación, PDF consolidado)
-- Idempotente.

ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS banco_entidad text,
  ADD COLUMN IF NOT EXISTS banco_tipo_cuenta text
    CHECK (banco_tipo_cuenta IS NULL OR banco_tipo_cuenta IN ('ahorros', 'corriente')),
  ADD COLUMN IF NOT EXISTS banco_numero_cuenta text,
  ADD COLUMN IF NOT EXISTS doc_validacion_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (doc_validacion_estado IN ('pendiente', 'aprobado', 'rechazado')),
  ADD COLUMN IF NOT EXISTS doc_validacion_observacion text,
  ADD COLUMN IF NOT EXISTS doc_validacion_en timestamptz,
  ADD COLUMN IF NOT EXISTS doc_validacion_por integer,
  ADD COLUMN IF NOT EXISTS doc_auditoria_ok boolean,
  ADD COLUMN IF NOT EXISTS doc_auditoria_resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS doc_auditoria_observaciones text,
  ADD COLUMN IF NOT EXISTS doc_auditoria_en timestamptz,
  ADD COLUMN IF NOT EXISTS doc_consolidado_blob_path text,
  ADD COLUMN IF NOT EXISTS doc_consolidado_nombre text,
  ADD COLUMN IF NOT EXISTS doc_bloqueado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rrhh_trabajadores.doc_validacion_estado IS
  'Estado de validación documental: pendiente | aprobado | rechazado.';
COMMENT ON COLUMN public.rrhh_trabajadores.doc_bloqueado IS
  'True tras aprobación con PDF consolidado; bloquea edición del TAB Documentación.';

-- Ampliar categorías de documentos RRHH (bancario + afiliación)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'rrhh_trabajador_documentos' AND constraint_name LIKE '%categoria%'
  ) THEN
    NULL; -- constraint name varies; drop/recreate below if needed
  END IF;
END $$;

ALTER TABLE public.rrhh_trabajador_documentos
  DROP CONSTRAINT IF EXISTS rrhh_trabajador_documentos_categoria_check;

ALTER TABLE public.rrhh_trabajador_documentos
  ADD CONSTRAINT rrhh_trabajador_documentos_categoria_check
  CHECK (categoria IN ('soporte', 'ingreso', 'bancario', 'afiliacion'));

-- Catálogo: permitir categorías bancarias/afiliación si se usan labels custom
-- (sin cambio de constraint si el catálogo ya es texto libre por categoria)

NOTIFY pgrst, 'reload schema';
