-- ClaraCore — Entradas Despachador: alertas silenciosas y entradas sin OC
-- Idempotente. Ejecutar en Supabase SQL Editor.

ALTER TABLE public.almacen_entrada
  ALTER COLUMN orden_compra_id DROP NOT NULL;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS alerta_silenciosa_codigo text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS alerta_silenciosa_detalle text;

ALTER TABLE public.almacen_entrada_item
  ALTER COLUMN orden_compra_item_id DROP NOT NULL;

ALTER TABLE public.almacen_entrada_item
  ALTER COLUMN presupuesto_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
