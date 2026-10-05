-- Asegura tipos de hallazgo de dibujo en so_auditoria_hallazgos (idempotente).
-- Necesario para que el sync de Auditoría pueda persistir cantidad_mayor_area.

ALTER TABLE public.so_auditoria_hallazgos
  DROP CONSTRAINT IF EXISTS so_auditoria_hallazgos_tipo_check;

ALTER TABLE public.so_auditoria_hallazgos
  ADD CONSTRAINT so_auditoria_hallazgos_tipo_check
  CHECK (tipo IN (
    'traslapo',
    'vacio',
    'no_auditable',
    'ubicacion_inconsistente',
    'costado_inconsistente',
    'cantidad_mayor_area'
  ));
