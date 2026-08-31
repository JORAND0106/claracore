-- Alerta visible tras edición dimensional del creador que cambia cantidad_total
-- (reset de validaciones + auditoría vía logs).

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS cantidad_alerta_anterior numeric,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_actual numeric,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_en timestamptz,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_por integer,
  ADD COLUMN IF NOT EXISTS cantidad_alerta_nivel_max_previo integer;

COMMENT ON COLUMN public.so_registros.cantidad_alerta_anterior IS
  'Cantidad total previa cuando cambia cantidad_total; visible a validadores hasta el nivel máx. previo.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_actual IS
  'Cantidad total nueva tras edición que dispara reset de validaciones.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_en IS
  'Momento del último cambio de cantidad que disparó alerta/reset.';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_por IS
  'Usuario que provocó el cambio de cantidad (alerta).';
COMMENT ON COLUMN public.so_registros.cantidad_alerta_nivel_max_previo IS
  'Mayor nivel Aprobado antes del cambio de cantidad; la alerta se muestra en N1..este nivel y se apaga al re-aprobarlo.';
