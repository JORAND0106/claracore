-- Identidad de la línea de almacén.
-- solicitado_por es de la línea y no se rellena con el autor de la solicitud
-- donde quedó después de Agrupar: ese dato sería el de quien agrupó.
-- No se modifican órdenes de compra ya emitidas.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS solicitado_por integer REFERENCES public.usuarios(id);

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS motivo_rechazo_linea text;

ALTER TABLE public.almacen_solicitud
  ADD COLUMN IF NOT EXISTS solicitud_origen_id bigint REFERENCES public.almacen_solicitud(id);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_origen
  ON public.almacen_solicitud (solicitud_origen_id);

COMMENT ON COLUMN public.almacen_solicitud_item.solicitado_por IS
  'Usuario que pidió la línea. No cambia al moverla de solicitud.';

COMMENT ON COLUMN public.almacen_solicitud.solicitud_origen_id IS
  'Solicitud de la que salieron las líneas al generar una OC parcial.';

NOTIFY pgrst, 'reload schema';
