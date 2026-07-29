-- Configuración de columnas visibles y anchos por contrato (SicoeObra / Presupuesto).
-- Ejecutar en Supabase SQL Editor (idempotente).

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS grillas_ui_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contratos.grillas_ui_config IS
  'Visibilidad y anchos de columnas por módulo (sicoe_obra, presupuesto). Nivel contrato, no usuario.';
