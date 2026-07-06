-- IVA y valor digitado en licenciatario (contrato de licenciamiento).
-- Ejecutar en Supabase SQL Editor después de contrato_documentos_contractuales.sql.

ALTER TABLE public.contrato_licencia_licenciatario
  ADD COLUMN IF NOT EXISTS valor_mensual_iva_incluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_mensual_digitado numeric;

COMMENT ON COLUMN public.contrato_licencia_licenciatario.valor_mensual IS
  'Valor mensual antes de IVA (pesos enteros) — usado en PDF contractual.';
COMMENT ON COLUMN public.contrato_licencia_licenciatario.valor_mensual_iva_incluido IS
  'True si valor_mensual_digitado fue ingresado con IVA incluido.';
COMMENT ON COLUMN public.contrato_licencia_licenciatario.valor_mensual_digitado IS
  'Valor tal como lo digitó el usuario (bruto o neto según valor_mensual_iva_incluido).';
