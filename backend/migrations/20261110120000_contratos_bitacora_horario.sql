-- Horario laboral semanal de Bitácora por contrato (JSONB).
-- Rige desde vigente_desde; las bitácoras ya guardadas conservan su snapshot
-- en seguimiento_bitacora_entrada.horario_aplicado.
-- Idempotente.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS bitacora_horario jsonb;

COMMENT ON COLUMN public.contratos.bitacora_horario IS
  'Horario laboral semanal Bitácora: { vigente_desde, dias: { lun..dom: { laborable, entrada, salida, almuerzo_inicio, almuerzo_fin } } }. Null = default 07:30–16:30 Lun–Vie con almuerzo 12:00–13:00.';

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS horario_aplicado jsonb;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.horario_aplicado IS
  'Snapshot del horario del contrato al guardar el diario. Conserva el horario con que se registró la bitácora.';

NOTIFY pgrst, 'reload schema';
