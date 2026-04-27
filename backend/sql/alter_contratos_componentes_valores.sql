-- Valores de componentes y costo directo contractual (panel admin / cálculos informes).
-- Ejecutar en Supabase (SQL editor) una vez.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS valor_componente_ambiental double precision,
  ADD COLUMN IF NOT EXISTS valor_componente_social double precision,
  ADD COLUMN IF NOT EXISTS valor_componente_pmt double precision,
  ADD COLUMN IF NOT EXISTS costo_directo_contrato double precision,
  ADD COLUMN IF NOT EXISTS costos_adicionales double precision;

COMMENT ON COLUMN public.contratos.valor_componente_ambiental IS 'Valor componente ambiental (COP) — dato maestro contrato';
COMMENT ON COLUMN public.contratos.valor_componente_social IS 'Valor componente social (COP) — dato maestro contrato';
COMMENT ON COLUMN public.contratos.valor_componente_pmt IS 'Valor componente PMT (COP) — dato maestro contrato';
COMMENT ON COLUMN public.contratos.costo_directo_contrato IS 'Costo directo del contrato (COP) — dato maestro';
COMMENT ON COLUMN public.contratos.costos_adicionales IS 'Costos adicionales (COP) — dato maestro contrato';
