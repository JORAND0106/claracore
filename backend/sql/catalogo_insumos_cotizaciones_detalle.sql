-- ClaraCore — Cotizaciones detalle (insumo + No Previstos) en catálogo de insumos
-- Idempotente. Extiende almacen_insumo con JSON editable tipo hoja de cálculo.

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS cotizaciones_detalle jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.almacen_insumo.cotizaciones_detalle IS
  'Filas de cotización tipo hoja de cálculo: [{id, tipo: insumo|no_previsto, es_ganadora, proveedor, valor, numero, fecha, vigencia}]. '
  'tipo=insumo = pactadas con el proveedor; tipo=no_previsto = sustento ante la entidad. '
  'La ganadora (es_ganadora) se sincroniza a cotizacion_numero/fecha/vigencia.';

NOTIFY pgrst, 'reload schema';
