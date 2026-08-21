-- Bitácora: materiales de obra, preoperacionales en equipos, destinatario de eventos.

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS materiales jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS dirigido_a text;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.materiales IS
  'Llegada de materiales [{tipo_material, proveedor, vales:[{nombre,blob_path,mime_type,origen,created_at}]}].';

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.dirigido_a IS
  'Destinatario del Reporte de Evento (cuando aplique según tipo).';

ALTER TABLE public.seguimiento_bitacora_equipo_uso
  ADD COLUMN IF NOT EXISTS preoperacionales jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.preoperacionales IS
  'Escáneres de preoperacionales [{nombre,blob_path,mime_type,origen,created_at}].';

NOTIFY pgrst, 'reload schema';
