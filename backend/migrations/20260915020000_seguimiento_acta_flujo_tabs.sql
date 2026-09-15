-- Flujo secuencial de pestañas del editor de actas (Orden → Asistentes →
-- Compromisos → Temas → Apartados/Vista previa). Idempotente.
ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS flujo_tabs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.seguimiento_acta.flujo_tabs IS
  'Progreso de pestañas del editor: {orden, asistentes, compromisos, ideas}.';
