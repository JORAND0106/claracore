-- AIU/IVA por línea de precio pactado (Tab Precios Subcontratistas).
-- Idempotente. precio_unitario_sub = valor ANTES de AIU/IVA.

ALTER TABLE public.subcontratista_precios
  ADD COLUMN IF NOT EXISTS tributos jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.subcontratista_precios
  ADD COLUMN IF NOT EXISTS precio_unitario_con_aiu numeric(18, 2);

COMMENT ON COLUMN public.subcontratista_precios.tributos IS
  'Desglose A/Í/U/IVA (puntos %): mismo shape que almacen_insumo.tributos.';

COMMENT ON COLUMN public.subcontratista_precios.precio_unitario_sub IS
  'VU Costo M.O. pactado ANTES de AIU/IVA.';

COMMENT ON COLUMN public.subcontratista_precios.precio_unitario_con_aiu IS
  'VU Costo M.O. DESPUÉS de aplicar tributos (COP entero redondeado).';

NOTIFY pgrst, 'reload schema';
