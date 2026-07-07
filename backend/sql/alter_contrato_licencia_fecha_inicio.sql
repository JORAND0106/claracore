-- Fecha de inicio de vigencia del contrato de licenciamiento (Cláusula 19 — {{FECHA_INICIO}}).
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.contrato_licencia_licenciatario
  ADD COLUMN IF NOT EXISTS fecha_inicio_licencia date;

COMMENT ON COLUMN public.contrato_licencia_licenciatario.fecha_inicio_licencia IS
  'Fecha desde la cual rige el contrato de licenciamiento (placeholder {{FECHA_INICIO}} en Cláusula 19).';

NOTIFY pgrst, 'reload schema';
