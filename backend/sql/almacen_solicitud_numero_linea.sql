-- ClaraCore — Almacén: numeración interna por insumo en solicitud
-- Idempotente.

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS numero_linea integer;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY solicitud_id ORDER BY id) AS rn
  FROM public.almacen_solicitud_item
)
UPDATE public.almacen_solicitud_item ai
SET numero_linea = numbered.rn
FROM numbered
WHERE ai.id = numbered.id
  AND ai.numero_linea IS NULL;

UPDATE public.almacen_solicitud_item
SET numero_linea = 1
WHERE numero_linea IS NULL;

ALTER TABLE public.almacen_solicitud_item
  ALTER COLUMN numero_linea SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_solicitud_item_linea
  ON public.almacen_solicitud_item (solicitud_id, numero_linea);

NOTIFY pgrst, 'reload schema';
