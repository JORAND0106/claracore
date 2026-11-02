-- Salidas «por revisar»: sector/receptor opcionales en registro tablet.
-- La única restricción dura sigue siendo entrada + no superar stock.

ALTER TABLE public.almacen_salida
  ADD COLUMN IF NOT EXISTS por_revisar boolean NOT NULL DEFAULT false;

ALTER TABLE public.almacen_salida
  ADD COLUMN IF NOT EXISTS por_revisar_motivos text;

ALTER TABLE public.almacen_salida
  ALTER COLUMN receptor_usuario_id DROP NOT NULL;

COMMENT ON COLUMN public.almacen_salida.por_revisar IS
  'True si faltan datos secundarios (sector, receptor, etc.) y debe validarse.';

COMMENT ON COLUMN public.almacen_salida.por_revisar_motivos IS
  'Motivos legibles unidos con « | » (p. ej. Sin sector | Sin receptor).';

CREATE INDEX IF NOT EXISTS idx_almacen_salida_por_revisar
  ON public.almacen_salida (contrato_id, por_revisar)
  WHERE por_revisar = true;

NOTIFY pgrst, 'reload schema';
