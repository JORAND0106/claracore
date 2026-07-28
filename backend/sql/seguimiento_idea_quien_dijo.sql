-- Espejo de migrations/20260727210000_seguimiento_idea_quien_dijo.sql
-- Si la columna ya existe pero Interviniente no persiste, ejecute al menos:
--   NOTIFY pgrst, 'reload schema';
ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS quien_dijo text;

COMMENT ON COLUMN public.seguimiento_acta_idea.quien_dijo IS
  'Nombre de quien planteó la idea (libre o asistente del acta).';

NOTIFY pgrst, 'reload schema';
