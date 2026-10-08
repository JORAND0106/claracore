-- Marca de saldado en asignaciones compartidas + columnas de auditoría.
-- Idempotente.

ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado boolean NOT NULL DEFAULT false;

ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado_at timestamptz;

ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado_por integer;

COMMENT ON COLUMN public.presupuesto_sub_asignacion.saldado IS
  'True si se cerró la participación del sub en este registro (cantidad fija en lo reconocido como ejecutado).';

COMMENT ON COLUMN public.presupuesto_sub_asignacion.saldado_at IS
  'Momento en que se saldó la asignación.';

COMMENT ON COLUMN public.presupuesto_sub_asignacion.saldado_por IS
  'Usuario que saldó la asignación.';

-- Historial: decisiones mantener/saldar (además de proporciones/detalle).
ALTER TABLE public.presupuesto_sub_redistribucion
  ADD COLUMN IF NOT EXISTS decisiones jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.presupuesto_sub_redistribucion.decisiones IS
  'Mapa {subcontratista_id: "mantener"|"saldar"} de subcontratistas existentes en la operación.';
