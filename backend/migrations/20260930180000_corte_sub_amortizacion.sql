-- Amortización del anticipo en conciliación de corte subcontratista.
ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS anticipo_entregado numeric(18, 0) NOT NULL DEFAULT 0;

ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS amortizado_anterior numeric(18, 0) NOT NULL DEFAULT 0;

ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS pct_amortizacion numeric(12, 6);

ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS amortizacion_presente numeric(18, 0) NOT NULL DEFAULT 0;

ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS saldo_por_amortizar numeric(18, 0) NOT NULL DEFAULT 0;

ALTER TABLE public.corte_sub_conciliacion
  ADD COLUMN IF NOT EXISTS subtotal_despues_amortizacion numeric(18, 0) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.corte_sub_conciliacion.amortizacion_presente IS
  'Amortización del presente corte (0 dp). Solo cuenta en histórico si estado=enviado. Reabrir → borrador la excluye de cortes posteriores hasta reenviar.';
