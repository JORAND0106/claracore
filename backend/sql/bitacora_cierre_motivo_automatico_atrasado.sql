-- Mirror de migrations/20261009010000_bitacora_cierre_motivo_automatico_atrasado.sql
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

NOTIFY pgrst, 'reload schema';
