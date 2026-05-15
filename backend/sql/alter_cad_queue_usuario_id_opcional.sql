-- Opcional: columna para auditoría / compatibilidad con clientes que envían `usuario_id` a nivel de fila.
-- Si PostgREST reportaba PGRST204 sobre `cad_queue.usuario_id`, ejecutar este script en el SQL Editor de Supabase.
-- No afecta a SicoeCAD si solo lee `payload` (JSON); la app ClaraCore ya guarda el usuario dentro de `payload`.

ALTER TABLE public.cad_queue
  ADD COLUMN IF NOT EXISTS usuario_id bigint;

COMMENT ON COLUMN public.cad_queue.usuario_id IS
  'Opcional. Quien encoló la operación (sub del JWT). La cola sigue funcionando solo con payload JSON.';
