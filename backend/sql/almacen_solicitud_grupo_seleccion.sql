-- ClaraCore — Almacén: grupo de líneas nacidas de una misma selección
-- (tramo o varios PK-ID del mismo ítem y material).
-- Idempotente. Acceso vía FastAPI (service_role).

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS grupo_seleccion text;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS grupo_etiqueta text;

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_grupo
  ON public.almacen_solicitud_item (solicitud_id, grupo_seleccion);

COMMENT ON COLUMN public.almacen_solicitud_item.grupo_seleccion IS
  'Identificador del grupo automático: líneas generadas juntas al pedir un tramo o varios PK-ID.';

COMMENT ON COLUMN public.almacen_solicitud_item.grupo_etiqueta IS
  'Etiqueta visible del grupo (tramo y material).';

NOTIFY pgrst, 'reload schema';
