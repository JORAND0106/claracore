-- Desglose de costos adicionales por concepto contractual (COP$).
-- No se integran a cobro presupuestal, AIU, IVA ni cálculo de listados; son referencia maestra del contrato.
-- Tras migrar, el backend mantiene costos_adicionales = suma de importes (compatibilidad).
-- Ejecutar en Supabase (SQL editor) una vez.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS costos_adicionales_lista jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Datos existentes: un solo monto en costos_adicionales → un ítem
UPDATE public.contratos
SET
  costos_adicionales_lista = jsonb_build_array(
    jsonb_build_object(
      'concepto_contractual', 'Importe (sin desglose — migrado automáticamente)',
      'valor', costos_adicionales
    )
  )
WHERE
  costos_adicionales_lista = '[]'::jsonb
  AND costos_adicionales IS NOT NULL
  AND costos_adicionales <> 0;

COMMENT ON COLUMN public.contratos.costos_adicionales_lista IS
  'Lista JSON por ítem: concepto_contractual, valor_mensual, tiempo_meses, valor=round(mensual*meses,0). Suma de valor en costos_adicionales (scalar).';
