-- Vínculo registro ↔ cuadro de despiece de acero (SicoeObra).
-- Ejecutar en SQL Editor de Supabase.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS cuadro_aceros_id text,
  ADD COLUMN IF NOT EXISTS cuadro_aceros_nombre text,
  ADD COLUMN IF NOT EXISTS cuadro_aceros_posicion text,
  ADD COLUMN IF NOT EXISTS cuadro_aceros_posicion_id text,
  ADD COLUMN IF NOT EXISTS cuadro_aceros_schedule jsonb;

COMMENT ON COLUMN public.so_registros.cuadro_aceros_id IS
  'UUID/id del cuadro de aceros que generó este registro; varios registros comparten el mismo id.';
COMMENT ON COLUMN public.so_registros.cuadro_aceros_nombre IS
  'Nombre del cuadro (p. ej. Cabezal descole).';
COMMENT ON COLUMN public.so_registros.cuadro_aceros_posicion IS
  'Nombre de la posición en el cuadro (p. ej. As1).';
COMMENT ON COLUMN public.so_registros.cuadro_aceros_posicion_id IS
  'Id estable de la posición dentro del schedule JSON.';
COMMENT ON COLUMN public.so_registros.cuadro_aceros_schedule IS
  'Snapshot del schedule de despiece (para reabrir/editar el cuadro).';

CREATE INDEX IF NOT EXISTS idx_so_registros_cuadro_aceros_id
  ON public.so_registros (contrato_id, cuadro_aceros_id)
  WHERE cuadro_aceros_id IS NOT NULL;
