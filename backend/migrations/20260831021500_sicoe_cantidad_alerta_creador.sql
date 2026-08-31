-- Alerta visible tras edición dimensional del creador que cambia cantidad_total
-- (reset de validaciones + auditoría vía logs).

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS cantidad_alerta_anterior numeric,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_actual numeric,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_en timestamptz,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_por integer;

COMMENT ON COLUMN public.so_registros.cantidad_alerta_anterior IS
  'Cantidad total previa cuando el creador (o edición dimensional) cambia cantidad; visible a validadores.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_actual IS
  'Cantidad total nueva tras edición dimensional con reset de validaciones.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_en IS
  'Momento del último cambio de cantidad que disparó alerta/reset.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_por IS
  'Usuario que provocó el cambio de cantidad (alerta).';
