-- Columna de respaldo ya presente en producción: so_registros.acta_rpo_id_backup_swap
-- Usada por la herramienta Desarrollador «Mover registros entre actas» para conservar
-- el acta RPO original antes de reasignar acta_rpo_id (trazabilidad / reversión manual).
-- Idempotente: no falla si la columna ya existe.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS acta_rpo_id_backup_swap bigint REFERENCES public.actas(id);

COMMENT ON COLUMN public.so_registros.acta_rpo_id_backup_swap IS
  'Respaldo del acta_rpo_id previo al mover registros entre actas (herramienta Desarrollador). Conserva el primer origen.';
