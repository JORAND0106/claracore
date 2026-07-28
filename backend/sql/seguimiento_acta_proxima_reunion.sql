-- Reserva de espacio para la próxima reunión (cierre del acta actual).
-- Mirror de migrations/20260728120000_seguimiento_acta_proxima_reunion.sql

ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS proxima_fecha date,
  ADD COLUMN IF NOT EXISTS proxima_hora text,
  ADD COLUMN IF NOT EXISTS proxima_lugar text;

COMMENT ON COLUMN public.seguimiento_acta.proxima_fecha IS
  'Fecha tentativa de la próxima reunión (reserva al cierre del acta).';
COMMENT ON COLUMN public.seguimiento_acta.proxima_hora IS
  'Hora tentativa de la próxima reunión.';
COMMENT ON COLUMN public.seguimiento_acta.proxima_lugar IS
  'Lugar tentativo de la próxima reunión.';

NOTIFY pgrst, 'reload schema';
