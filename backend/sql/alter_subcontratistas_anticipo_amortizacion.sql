-- Anticipo y % amortización en datos del subcontratista (captura; sin cálculo aún).
-- Idempotente.
-- amortizacion_pct: puntos porcentuales (5 = 5%), misma convención que tributos.

ALTER TABLE public.subcontratistas
  ADD COLUMN IF NOT EXISTS anticipo numeric(18, 2);

ALTER TABLE public.subcontratistas
  ADD COLUMN IF NOT EXISTS amortizacion_pct numeric(12, 6);

COMMENT ON COLUMN public.subcontratistas.anticipo IS
  'Valor de anticipo pactado (COP). Solo captura; sin efecto en cortes aún.';

COMMENT ON COLUMN public.subcontratistas.amortizacion_pct IS
  '% de amortización del anticipo en puntos (5 = 5%). Solo captura; sin efecto en cortes aún.';

NOTIFY pgrst, 'reload schema';
