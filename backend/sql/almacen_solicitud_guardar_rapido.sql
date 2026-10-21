-- Misma migración que backend/migrations/20261021180000_almacen_solicitud_guardar_rapido.sql
-- La aplica el arranque del API cuando existe SUPABASE_DB_URL. No hace falta ejecutarla a mano.

ALTER TABLE public.almacen_solicitud
  ADD COLUMN IF NOT EXISTS tareas_fondo jsonb;

COMMENT ON COLUMN public.almacen_solicitud.tareas_fondo IS
  'Estado de nombre, precio, proveedor y log que corren después de confirmar el guardado.';

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_presupuesto
  ON public.almacen_solicitud_item (presupuesto_id);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_presupuesto_pk
  ON public.almacen_solicitud_item (presupuesto_id, pk_id);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_solicitud
  ON public.almacen_solicitud_item (solicitud_id);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_insumo
  ON public.almacen_solicitud_item (insumo_id)
  WHERE insumo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_contrato_estado
  ON public.almacen_solicitud (contrato_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_contrato_consecutivo
  ON public.almacen_solicitud (contrato_id, consecutivo DESC);

CREATE INDEX IF NOT EXISTS idx_listado_precios_contrato
  ON public.listado_precios (contrato_id);

CREATE INDEX IF NOT EXISTS idx_listado_precios_contrato_item
  ON public.listado_precios (contrato_id, item_numero);

CREATE INDEX IF NOT EXISTS idx_presupuesto_contrato_capitulo_pk
  ON public.presupuesto (contrato_id, capitulo, pk_id);

NOTIFY pgrst, 'reload schema';
