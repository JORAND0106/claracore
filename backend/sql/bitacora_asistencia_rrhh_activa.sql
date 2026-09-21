-- Mirror de migrations/20260925120000_bitacora_asistencia_rrhh_activa.sql
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contratos.bitacora_asistencia_rrhh_activa IS
  'Activa gate Bitácora↔RRHH (individual + doc Aprobada) en el contrato exento (ID 3). Irrelevante en otros contratos tras el corte global.';

NOTIFY pgrst, 'reload schema';
