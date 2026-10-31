-- ClaraCore — Entradas: marca «por revisar» (registro tablet sin bloqueos)
-- Idempotente. Ejecutar en Supabase SQL Editor o vía schema_migrations_runner.

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS por_revisar boolean NOT NULL DEFAULT false;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS por_revisar_motivos text;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS proveedor_nombre_texto text;

COMMENT ON COLUMN public.almacen_entrada.por_revisar IS
  'True si la entrada requiere revisión administrativa (sin OC, supera saldo, sin foto, etc.). Cuenta para stock.';

COMMENT ON COLUMN public.almacen_entrada.por_revisar_motivos IS
  'Motivos breves separados por « | » (códigos legibles).';

COMMENT ON COLUMN public.almacen_entrada.proveedor_nombre_texto IS
  'Nombre libre cuando el proveedor/escombrera no está en el directorio.';

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_por_revisar
  ON public.almacen_entrada (contrato_id, por_revisar)
  WHERE por_revisar = true;

NOTIFY pgrst, 'reload schema';
