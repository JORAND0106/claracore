-- ClaraCore — Auditoría del interruptor Bitácora↔ RRHH + marca de apagado
-- Idempotente.
--
-- bitacora_asistencia_rrhh_activa_en / _por: último cambio del interruptor.
-- bitacora_asistencia_rrhh_apagada_en: última vez que se apagó (cutoff para
--   personal nuevo → solo validación individual / excluido de masiva).

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa_en timestamptz NULL;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa_por integer NULL;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_apagada_en timestamptz NULL;

COMMENT ON COLUMN public.contratos.bitacora_asistencia_rrhh_activa_en IS
  'Último cambio del interruptor Bitácora↔RRHH (hora Colombia / timestamptz).';

COMMENT ON COLUMN public.contratos.bitacora_asistencia_rrhh_activa_por IS
  'Usuario que realizó el último cambio del interruptor Bitácora↔RRHH.';

COMMENT ON COLUMN public.contratos.bitacora_asistencia_rrhh_apagada_en IS
  'Última vez que el interruptor se apagó. Colaboradores creados después solo se aprueban individualmente.';

NOTIFY pgrst, 'reload schema';
