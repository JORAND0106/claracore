-- Auditoría: quién y cuándo recalculó cantidades (dimensiones / cant. total) en un registro de presupuesto.
-- Aplicar en Supabase (SQL editor) o vía psql.

ALTER TABLE public.presupuesto ADD COLUMN IF NOT EXISTS calculo_por text;
ALTER TABLE public.presupuesto ADD COLUMN IF NOT EXISTS calculo_en timestamptz;

COMMENT ON COLUMN public.presupuesto.calculo_por IS
  'Nombre o identificación del usuario que ejecutó el último recálculo de cantidades/costos (dimensiones).';
COMMENT ON COLUMN public.presupuesto.calculo_en IS
  'Marca de tiempo del último recálculo de cantidades/costos (dimensiones).';
