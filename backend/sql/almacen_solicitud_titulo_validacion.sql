-- Almacén: título de solicitud y validación por ítem
-- Idempotente — ejecutar en Supabase SQL Editor o vía migración.

ALTER TABLE public.almacen_solicitud
  ADD COLUMN IF NOT EXISTS titulo text;

COMMENT ON COLUMN public.almacen_solicitud.titulo IS
  'Nombre descriptivo de la solicitud (identificación en listados).';

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS estado_validacion text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'almacen_solicitud_item_estado_validacion_chk'
  ) THEN
    ALTER TABLE public.almacen_solicitud_item
      ADD CONSTRAINT almacen_solicitud_item_estado_validacion_chk
      CHECK (
        estado_validacion IS NULL
        OR estado_validacion IN ('pendiente', 'aprobado', 'rechazado')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.almacen_solicitud_item.estado_validacion IS
  'Validación por ítem: pendiente | aprobado | rechazado (solo solicitudes enviadas).';
