-- Conserva el acta RPO del registro al revertir (doble llave / aceptar reversión)
-- para poder ofrecer conservar original vs asignar vigente al revalidar.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS acta_rpo_id_pre_reversion bigint REFERENCES public.actas(id);

COMMENT ON COLUMN public.so_registros.acta_rpo_id_pre_reversion IS
  'Acta RPO a la que pertenecía el registro antes de la reversión. Si no es null, al revalidar (nivel que asigna acta) se pregunta conservar original vs vigente.';

CREATE INDEX IF NOT EXISTS idx_so_registros_acta_pre_reversion
  ON public.so_registros (contrato_id, acta_rpo_id_pre_reversion)
  WHERE acta_rpo_id_pre_reversion IS NOT NULL;
