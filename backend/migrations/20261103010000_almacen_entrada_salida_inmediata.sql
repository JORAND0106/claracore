-- Marca de salida inmediata pendiente (granulares usados de una vez).
-- La entrada queda registrada; la salida se confirma después (stock de salida
-- solo se descuenta al confirmar). Si el popup se cierra, la marca permanece.
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS salida_inmediata_pendiente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.almacen_entrada.salida_inmediata_pendiente IS
  'True si al registrar la entrada se pidió salida inmediata y aún no se confirmó.';

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_salida_inmediata_pendiente
  ON public.almacen_entrada (contrato_id, salida_inmediata_pendiente)
  WHERE salida_inmediata_pendiente = true;

NOTIFY pgrst, 'reload schema';
