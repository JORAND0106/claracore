-- Índices recomendados para Solicitud de Materiales (rendimiento).
-- Ejecutar en Supabase / Postgres del entorno. Idempotente.

-- Acumulados por ítem de presupuesto (validación / contexto)
CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_presupuesto
  ON public.almacen_solicitud_item (presupuesto_id);

-- Ítems por solicitud (get / list resumen / delete-replace)
CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_solicitud
  ON public.almacen_solicitud_item (solicitud_id);

-- Consumo negociado por insumo
CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_insumo
  ON public.almacen_solicitud_item (insumo_id)
  WHERE insumo_id IS NOT NULL;

-- Listado de precios por contrato (caché de app + filtros)
CREATE INDEX IF NOT EXISTS idx_listado_precios_contrato
  ON public.listado_precios (contrato_id);

CREATE INDEX IF NOT EXISTS idx_listado_precios_contrato_item
  ON public.listado_precios (contrato_id, item_numero);

-- Solicitudes por contrato + estado (grilla)
CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_contrato_estado
  ON public.almacen_solicitud (contrato_id, estado, created_at DESC);
