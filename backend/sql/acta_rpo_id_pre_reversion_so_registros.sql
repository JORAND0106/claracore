-- Columna para conservar acta original tras reversión (revalidación con elección).
-- Idempotente: no falla si la columna ya existe.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS acta_rpo_id_pre_reversion bigint REFERENCES public.actas(id);

COMMENT ON COLUMN public.so_registros.acta_rpo_id_pre_reversion IS
  'Acta RPO a la que pertenecía el registro antes de la reversión. Si no es null, al revalidar (nivel que asigna acta) se pregunta conservar original vs vigente.';
