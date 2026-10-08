-- ClaraCore — Motivo de cierre «automatico_atrasado» en Bitácora
-- Idempotente.
--
-- La plataforma cierra diarios atrasados con cierre_motivo = 'automatico_atrasado'
-- (ver bitacora_service.asegurar_autocierre_entrada). El CHECK original solo
-- admitía ('manual', 'automatico_dia', 'creacion_evento'), lo que rompía el
-- Libro digital al intentar el autocierre lazy (Postgres 23514).

ALTER TABLE public.seguimiento_bitacora_entrada
  DROP CONSTRAINT IF EXISTS seguimiento_bitacora_entrada_cierre_motivo_check;

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD CONSTRAINT seguimiento_bitacora_entrada_cierre_motivo_check
  CHECK (
    cierre_motivo IS NULL
    OR cierre_motivo IN (
      'manual',
      'automatico_dia',
      'automatico_atrasado',
      'creacion_evento'
    )
  );

COMMENT ON CONSTRAINT seguimiento_bitacora_entrada_cierre_motivo_check
  ON public.seguimiento_bitacora_entrada IS
  'Motivos de cierre de Bitácora: manual, automatico_dia, automatico_atrasado, creacion_evento.';

NOTIFY pgrst, 'reload schema';
