-- Observaciones opcionales de cada gasto de caja menor.
ALTER TABLE public.caja_menor_gasto
  ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN public.caja_menor_gasto.observaciones IS
  'Nota opcional del gasto, escrita por quien registra la compra.';

NOTIFY pgrst, 'reload schema';
