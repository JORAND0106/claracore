-- ClaraCore — Almacén: costo base e impuestos en insumos
-- Ejecutar después de almacen_solicitud_insumos.sql. Idempotente.

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS costo_base numeric(18, 2);

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS impuestos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.almacen_insumo.costo_base IS
  'Costo unitario sin impuestos. valor_compra_referencia = costo_base + impuestos.';

COMMENT ON COLUMN public.almacen_insumo.impuestos IS
  'Lista JSON: [{ "nombre": "IVA", "tipo": "porcentaje"|"valor", "valor": number }]';

NOTIFY pgrst, 'reload schema';
