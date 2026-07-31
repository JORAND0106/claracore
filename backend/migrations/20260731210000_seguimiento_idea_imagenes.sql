-- Esquemas / gráficos adjuntos a ideas centrales del acta.

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS imagenes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.seguimiento_acta_idea.imagenes IS
  'Lista de esquemas/gráficos [{nombre, blob_path, mime_type, created_at, kind?}]. '
  'Sin data_uri persistido cuando hay blob_path.';

NOTIFY pgrst, 'reload schema';
