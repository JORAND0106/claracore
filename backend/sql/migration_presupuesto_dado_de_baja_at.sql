-- Papelera de presupuesto: marca temporal de baja + índice para purga / listado reciente.
-- Ejecutar en Supabase (SQL editor) antes o junto al deploy del cron.

ALTER TABLE public.presupuesto
  ADD COLUMN IF NOT EXISTS dado_de_baja_at timestamptz;

COMMENT ON COLUMN public.presupuesto.dado_de_baja_at IS
  'Momento en que el registro entró a Papelera (dado_de_baja=true). NULL si está activo. Usado para purga a 30 días y orden reciente.';

-- Backfill: aproximar con updated_at / created_at para filas ya en papelera.
UPDATE public.presupuesto
SET dado_de_baja_at = COALESCE(updated_at, created_at, now())
WHERE dado_de_baja IS TRUE
  AND dado_de_baja_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_presupuesto_papelera_reciente
  ON public.presupuesto (contrato_id, dado_de_baja_at DESC NULLS LAST, id DESC)
  WHERE dado_de_baja IS TRUE;

CREATE INDEX IF NOT EXISTS idx_presupuesto_papelera_purge
  ON public.presupuesto (dado_de_baja_at)
  WHERE dado_de_baja IS TRUE;
