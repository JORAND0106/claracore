-- ClaraCore — Entradas / Despachador: campos extendidos y saldo consumible OC
-- Idempotente. Ejecutar en Supabase SQL Editor.

-- Saldo valor consumible por línea de OC
ALTER TABLE public.almacen_orden_compra_item
  ADD COLUMN IF NOT EXISTS valor_recibido numeric(18, 2) NOT NULL DEFAULT 0
  CHECK (valor_recibido >= 0);

-- Campos Despachador en entrada
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'recibo'
  CHECK (tipo IN ('disposicion', 'recibo'));

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS numero_documento text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS insumo_id bigint REFERENCES public.almacen_insumo(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS pk_id text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS tramo text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS costado text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS abscisa_inicial text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS abscisa_final text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS placa text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS transportador text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS disposicion_pdf_blob_path text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS disposicion_pdf_nombre text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS disposicion_pdf_mime text;

ALTER TABLE public.almacen_entrada_item
  ADD COLUMN IF NOT EXISTS valor_recibido numeric(18, 2);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_tipo
  ON public.almacen_entrada (contrato_id, tipo);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_proveedor_insumo
  ON public.almacen_entrada (contrato_id, proveedor_id, insumo_id);

NOTIFY pgrst, 'reload schema';
