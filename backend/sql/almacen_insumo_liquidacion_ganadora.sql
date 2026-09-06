-- Liquidación del valor negociado al cambiar la cotización ganadora.
-- Idempotente. Ejecutar en Supabase SQL Editor + NOTIFY pgrst.

-- Acumulado histórico congelado (lo ya entrado valuado a precios ganadores previos)
ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS valor_consumido_congelado numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_entradas_liquidada numeric(18, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.almacen_insumo.valor_consumido_congelado IS
  'Valor de entradas ya liquidado a precios de cotizaciones ganadoras anteriores (no retroactivo).';
COMMENT ON COLUMN public.almacen_insumo.cantidad_entradas_liquidada IS
  'Cantidad de entradas ya incorporada en valor_consumido_congelado tras liquidaciones.';

COMMENT ON COLUMN public.almacen_insumo.valor_negociado_total IS
  'Valor total negociado acumulado = valor_consumido_congelado + remanente×precio ganador actual';

CREATE TABLE IF NOT EXISTS public.almacen_insumo_liquidacion_ganadora (
  id                              bigserial PRIMARY KEY,
  insumo_id                       bigint NOT NULL REFERENCES public.almacen_insumo(id) ON DELETE CASCADE,
  contrato_id                     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  valor_compra_anterior           numeric(18, 2),
  valor_compra_nuevo              numeric(18, 2),
  cantidad_negociada              numeric(18, 4),
  cantidad_entradas               numeric(18, 4) NOT NULL DEFAULT 0,
  cantidad_entradas_prev_liquidada numeric(18, 4) NOT NULL DEFAULT 0,
  cantidad_congelada_delta        numeric(18, 4) NOT NULL DEFAULT 0,
  valor_congelado_delta           numeric(18, 2) NOT NULL DEFAULT 0,
  valor_consumido_congelado       numeric(18, 2) NOT NULL DEFAULT 0,
  cantidad_pendiente              numeric(18, 4) NOT NULL DEFAULT 0,
  valor_pendiente_revaluado       numeric(18, 2) NOT NULL DEFAULT 0,
  valor_negociado_total_antes     numeric(18, 2),
  valor_negociado_total_despues   numeric(18, 2) NOT NULL,
  cotizacion_numero_anterior      text,
  cotizacion_numero_nueva         text,
  motivo                          text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_liq_ganadora_insumo
  ON public.almacen_insumo_liquidacion_ganadora (insumo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_liq_ganadora_contrato
  ON public.almacen_insumo_liquidacion_ganadora (contrato_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
