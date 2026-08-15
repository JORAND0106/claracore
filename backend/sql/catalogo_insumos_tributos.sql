-- ClaraCore — Catálogo de insumos: desglose independiente AIU / IVA
-- Idempotente. Ejecutar en Supabase tras catalogo_insumos_modulo.sql.

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS tributos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.almacen_insumo.tributos IS
  'Desglose editable: { aiu: {administracion, imprevistos, utilidad, iva_utilidad}, iva: {porcentaje, sobre} }. '
  'Independiente de tipo_impuesto/impuesto_porcentaje (legado). No redefine aún el cálculo de valor_compra_referencia.';

ALTER TABLE public.almacen_insumo_precio_historial
  ADD COLUMN IF NOT EXISTS tributos jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
