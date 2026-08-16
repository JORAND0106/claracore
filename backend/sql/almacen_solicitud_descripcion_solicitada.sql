-- ClaraCore — Solicitud: descripción libre del Contratista (antes de mapear al catálogo).
-- Idempotente. Ejecutar en Supabase SQL Editor.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS descripcion_solicitada text;

COMMENT ON COLUMN public.almacen_solicitud_item.descripcion_solicitada IS
  'Texto libre del Contratista al solicitar. El Contratista Gerencial mapea luego a insumo_id.';

-- Solicitudes históricas creadas con insumo ya elegido: conservar el texto del material.
UPDATE public.almacen_solicitud_item
SET descripcion_solicitada = material_descripcion
WHERE descripcion_solicitada IS NULL
  AND material_descripcion IS NOT NULL
  AND btrim(material_descripcion) <> '';

NOTIFY pgrst, 'reload schema';
