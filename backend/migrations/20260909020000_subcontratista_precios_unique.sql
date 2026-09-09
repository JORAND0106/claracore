-- Unique (subcontratista_id, listado_precio_id) para upsert de precios pactados.
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subcontratista_precios_sub_lp_unique'
  ) THEN
    -- Deduplicar antes de crear el unique (conserva el id mínimo por par).
    DELETE FROM public.subcontratista_precios sp
    WHERE sp.id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY subcontratista_id, listado_precio_id
                 ORDER BY id
               ) AS rn
        FROM public.subcontratista_precios
      ) d
      WHERE d.rn > 1
    );

    ALTER TABLE public.subcontratista_precios
      ADD CONSTRAINT subcontratista_precios_sub_lp_unique
      UNIQUE (subcontratista_id, listado_precio_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT subcontratista_precios_sub_lp_unique ON public.subcontratista_precios IS
  'Un precio pactado por ítem de listado y subcontratista (upsert desde Ítem de Cobro).';
