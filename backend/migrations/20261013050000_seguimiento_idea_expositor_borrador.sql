-- Escritura por expositor + marca de borrador IA en temas del acta.
-- Solo aplica a actas nuevas (flujo_tabs.v >= 2 / temas_escritura_expositor).

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS expositor_usuario_id bigint;

ALTER TABLE public.seguimiento_acta_idea
  ADD COLUMN IF NOT EXISTS texto_es_borrador boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.seguimiento_acta_idea.expositor_usuario_id IS
  'Usuario plataforma del expositor del tema (desde orden del día). NULL = externo o sin usuario → solo elaborador.';

COMMENT ON COLUMN public.seguimiento_acta_idea.texto_es_borrador IS
  'True si el texto actual proviene de redacción asistida y aún no fue confirmado/editado por el expositor o elaborador.';

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_idea_expositor
  ON public.seguimiento_acta_idea (expositor_usuario_id)
  WHERE expositor_usuario_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
