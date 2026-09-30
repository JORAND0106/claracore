-- Anticipo / amortización en contratos (informe mensual CC-MES-001).
-- Idempotente. Misma convención que subcontratistas:
--   anticipo = COP; amortizacion_pct = puntos (5 = 5%).

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS anticipo numeric(18, 2);

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS amortizacion_pct numeric(12, 6);

COMMENT ON COLUMN public.contratos.anticipo IS
  'Valor del anticipo del contrato principal (COP). Alimenta Actualizadas del informe mensual.';

COMMENT ON COLUMN public.contratos.amortizacion_pct IS
  '% de amortización del anticipo en puntos (5 = 5%). Se aplica sobre CD+AIU del presente acta, con tope por saldo.';
