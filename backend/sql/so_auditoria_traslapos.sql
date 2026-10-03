-- Auditoría de traslapos/vacíos SicoeObra.
-- tolerancia por contrato (default 0,50 m; mínimo lógico 0,10 en aplicación).
-- sector opcional en registro: si ambos tienen sector y difiere, no hay traslapo entre ellos.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS sicoe_tolerancia_traslapo_m numeric(8, 2) DEFAULT 0.50;

COMMENT ON COLUMN public.contratos.sicoe_tolerancia_traslapo_m IS
  'Tolerancia (m) para alertas de traslapo/vacío lineal en SicoeObra. Default 0.50; app exige mínimo 0.10.';

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS sector text;

COMMENT ON COLUMN public.so_registros.sector IS
  'Sector opcional de ubicación. Si dos registros del mismo grupo lineal tienen sector distinto, no se consideran traslapo.';

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_item_numero
  ON public.so_registros (contrato_id, item_numero)
  WHERE item_numero IS NOT NULL AND btrim(item_numero) <> '';
