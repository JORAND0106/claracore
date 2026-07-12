-- Numeración individual de entradas por contrato (como líneas de solicitud)
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS numero_entrada integer;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY contrato_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.almacen_entrada
  WHERE numero_entrada IS NULL
)
UPDATE public.almacen_entrada e
SET numero_entrada = r.rn
FROM ranked r
WHERE e.id = r.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'almacen_entrada_numero_uq'
  ) THEN
    ALTER TABLE public.almacen_entrada
      ADD CONSTRAINT almacen_entrada_numero_uq UNIQUE (contrato_id, numero_entrada);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
