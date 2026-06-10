-- Tipo de localización del reporte: 'unica' (hereda a todos los registros) o 'multiple' (por registro).
-- Default 'unica' mantiene el comportamiento de reportes existentes.

ALTER TABLE public.so_reportes
  ADD COLUMN IF NOT EXISTS tipo_localizacion text NOT NULL DEFAULT 'unica';

ALTER TABLE public.so_reportes
  DROP CONSTRAINT IF EXISTS so_reportes_tipo_localizacion_check;

ALTER TABLE public.so_reportes
  ADD CONSTRAINT so_reportes_tipo_localizacion_check
  CHECK (tipo_localizacion IN ('unica', 'multiple'));

COMMENT ON COLUMN public.so_reportes.tipo_localizacion IS
  'unica: localización en cabecera del reporte; multiple: cada so_registros lleva su propia localización.';
