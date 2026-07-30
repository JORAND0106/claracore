-- Espejo de migrations/20260730120000_seguimiento_acta_horas_interventoria.sql

ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS hora_inicio text,
  ADD COLUMN IF NOT EXISTS hora_fin text;

COMMENT ON COLUMN public.seguimiento_acta.hora_inicio IS
  'Hora HH:MM (Bogotá) de inicio: primera acción de gestión sobre un compromiso del acta.';
COMMENT ON COLUMN public.seguimiento_acta.hora_fin IS
  'Hora HH:MM (Bogotá) de fin: última generación/actualización de idea central o apartado.';

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS numero_interventoria text;

COMMENT ON COLUMN public.contratos.numero_interventoria IS
  'Número del contrato de interventoría asociado al contrato de obra (encabezado de actas).';

NOTIFY pgrst, 'reload schema';
