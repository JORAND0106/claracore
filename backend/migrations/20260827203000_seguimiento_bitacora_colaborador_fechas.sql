-- Fechas históricas de colaborador (ingreso / retiro) en catálogo Bitácora.
-- No afectan el flujo diario de asistencia ni el agregado por cargo.

ALTER TABLE public.seguimiento_bitacora_colaborador
  ADD COLUMN IF NOT EXISTS fecha_ingreso date,
  ADD COLUMN IF NOT EXISTS fecha_retiro date;

COMMENT ON COLUMN public.seguimiento_bitacora_colaborador.fecha_ingreso IS
  'Fecha en que el colaborador ingresó al contrato/obra (dato histórico).';

COMMENT ON COLUMN public.seguimiento_bitacora_colaborador.fecha_retiro IS
  'Fecha de retiro cuando el colaborador queda Inactivo (dato histórico).';

NOTIFY pgrst, 'reload schema';
