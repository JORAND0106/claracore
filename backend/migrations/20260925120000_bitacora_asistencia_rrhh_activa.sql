-- ClaraCore — Flag de activación Bitácora↔ RRHH (contrato exento ID 3)
-- Idempotente.
--
-- Tras el corte 2026-09-28 00:00 America/Bogota, todos los contratos exigen
-- identificación individual + documentación Aprobada, salvo el contrato ID 3
-- mientras bitacora_asistencia_rrhh_activa = false. Un Desarrollador puede
-- activar el flag para alinear el contrato 3 con el resto.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_asistencia_rrhh_activa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contratos.bitacora_asistencia_rrhh_activa IS
  'Activa gate Bitácora↔RRHH (individual + doc Aprobada) en el contrato exento (ID 3). Irrelevante en otros contratos tras el corte global.';

NOTIFY pgrst, 'reload schema';
