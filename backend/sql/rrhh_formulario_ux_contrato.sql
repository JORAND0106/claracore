-- ClaraCore — Recursos Humanos: campos adicionales del formulario + consecutivo CTO-LAB
-- Idempotente.

-- ── Extender categorías del catálogo (parentesco) ────────────────────────────
ALTER TABLE public.rrhh_catalogo_opciones DROP CONSTRAINT IF EXISTS rrhh_catalogo_opciones_categoria_check;
ALTER TABLE public.rrhh_catalogo_opciones
  ADD CONSTRAINT rrhh_catalogo_opciones_categoria_check
  CHECK (categoria IN (
    'eps', 'pension', 'cesantias', 'arl',
    'caja_compensacion', 'cargo', 'tipo_contrato', 'parentesco'
  ));

-- ── Nuevos campos en trabajadores ────────────────────────────────────────────
ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS lugar_expedicion text,
  ADD COLUMN IF NOT EXISTS tipo_sangre text,
  ADD COLUMN IF NOT EXISTS salario_liquidable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS foto_blob_path text,
  ADD COLUMN IF NOT EXISTS foto_mime_type text,
  ADD COLUMN IF NOT EXISTS foto_nombre_archivo text,
  ADD COLUMN IF NOT EXISTS firma_blob_path text,
  ADD COLUMN IF NOT EXISTS firma_mime_type text,
  ADD COLUMN IF NOT EXISTS firma_nombre_archivo text;

COMMENT ON COLUMN public.rrhh_trabajadores.lugar_expedicion IS
  'Municipio de expedición del documento de identidad.';
COMMENT ON COLUMN public.rrhh_trabajadores.tipo_sangre IS
  'Grupo sanguíneo y RH (ej. O+, A-).';
COMMENT ON COLUMN public.rrhh_trabajadores.salario_liquidable IS
  'Indica si el salario es liquidable.';

-- ── Consecutivo de contratos laborales por obra ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_contrato_laboral_seq (
  contrato_id           integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  ultimo                integer NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rrhh_contrato_laboral_seq IS
  'Consecutivo interno para números CTO-LAB-NNNN por contrato de obra.';

ALTER TABLE public.rrhh_contrato_laboral_seq ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_contrato_laboral_seq'
      AND policyname = 'rrhh_contrato_laboral_seq_service'
  ) THEN
    CREATE POLICY rrhh_contrato_laboral_seq_service
      ON public.rrhh_contrato_laboral_seq
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Renombrar función visible en Control de accesos: RRHH → Recursos Humanos
UPDATE public.funciones
SET nombre = 'Recursos Humanos'
WHERE upper(trim(coalesce(codigo::text, ''))) = 'RRHH'
   OR lower(trim(coalesce(nombre::text, ''))) IN ('rrhh', 'recursos humanos');

NOTIFY pgrst, 'reload schema';
