-- Copia operativa / apply manual (ver migración homónima en backend/migrations/).
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_idempotency
  ON public.almacen_entrada (contrato_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_remision_proveedor_id
  ON public.almacen_entrada (contrato_id, upper(btrim(numero_documento)), proveedor_id)
  WHERE tipo = 'recibo'
    AND numero_documento IS NOT NULL
    AND btrim(numero_documento) <> ''
    AND proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_remision_proveedor_nombre
  ON public.almacen_entrada (
    contrato_id,
    upper(btrim(numero_documento)),
    lower(btrim(proveedor_nombre_texto))
  )
  WHERE tipo = 'recibo'
    AND numero_documento IS NOT NULL
    AND btrim(numero_documento) <> ''
    AND proveedor_id IS NULL
    AND proveedor_nombre_texto IS NOT NULL
    AND btrim(proveedor_nombre_texto) <> '';

ALTER TABLE public.almacen_config
  ADD COLUMN IF NOT EXISTS alerta_saldo_amarillo_pct numeric(5, 2) NOT NULL DEFAULT 20
    CHECK (alerta_saldo_amarillo_pct > 0 AND alerta_saldo_amarillo_pct <= 100);

ALTER TABLE public.almacen_config
  ADD COLUMN IF NOT EXISTS alerta_saldo_rojo_pct numeric(5, 2) NOT NULL DEFAULT 5
    CHECK (alerta_saldo_rojo_pct > 0 AND alerta_saldo_rojo_pct <= 100);

CREATE TABLE IF NOT EXISTS public.almacen_oc_item_alerta_enviada (
  orden_compra_item_id bigint NOT NULL
    REFERENCES public.almacen_orden_compra_item(id) ON DELETE CASCADE,
  umbral text NOT NULL CHECK (umbral IN ('amarillo', 'rojo')),
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (orden_compra_item_id, umbral)
);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_item_alerta_contrato
  ON public.almacen_oc_item_alerta_enviada (contrato_id);

NOTIFY pgrst, 'reload schema';
