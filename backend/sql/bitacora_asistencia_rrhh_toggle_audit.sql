-- Mirror de migrations/20261021220000_bitacora_asistencia_rrhh_toggle_audit.sql
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa_en timestamptz NULL;
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa_por integer NULL;
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_apagada_en timestamptz NULL;
NOTIFY pgrst, 'reload schema';
