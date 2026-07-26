-- Seguimiento mejoras bandeja/actas (idempotente).
-- Extiende esquema existente sin romper tablas.

ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS hora_vencimiento text,
  ADD COLUMN IF NOT EXISTS consecutivo integer,
  ADD COLUMN IF NOT EXISTS referido_a_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referido_a_nombre text,
  ADD COLUMN IF NOT EXISTS relacion_destinatario text
    CHECK (relacion_destinatario IS NULL OR relacion_destinatario IN ('asignacion', 'referencia'));

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_referido
  ON public.seguimiento_item (referido_a_id)
  WHERE referido_a_id IS NOT NULL;

ALTER TABLE public.seguimiento_acta_asistente
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.seguimiento_item.hora_vencimiento IS
  'Hora opcional de entrega (HH:MM) en zona Bogotá.';
COMMENT ON COLUMN public.seguimiento_item.relacion_destinatario IS
  'asignacion = responsable formal; referencia = copia informativa al referido.';
COMMENT ON COLUMN public.seguimiento_item.consecutivo IS
  'Número correlativo de bandeja (por creador en tareas; por contrato en compromisos).';

NOTIFY pgrst, 'reload schema';
