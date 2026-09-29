-- ClaraCore — Almacén: líneas de solicitud «Administración (AIU)»
-- Sin ítem de obra ni control de presupuesto por PK-ID.
-- Idempotente. Ejecutar en Supabase SQL Editor o vía migración.

-- presupuesto_id opcional: AIU no apunta a un registro del listado de precios.
ALTER TABLE public.almacen_solicitud_item
  ALTER COLUMN presupuesto_id DROP NOT NULL;

COMMENT ON COLUMN public.almacen_solicitud_item.presupuesto_id IS
  'Registro de presupuesto de obra. NULL cuando capítulo/ítem es Administración (AIU).';

-- OC generada desde líneas AIU tampoco tiene presupuesto de obra.
ALTER TABLE public.almacen_orden_compra_item
  ALTER COLUMN presupuesto_id DROP NOT NULL;

COMMENT ON COLUMN public.almacen_orden_compra_item.presupuesto_id IS
  'Registro de presupuesto de obra. NULL en líneas Administración (AIU).';

NOTIFY pgrst, 'reload schema';
