-- ClaraCore — Checkpoint manual de Temas (sin síntesis periódica automática).
-- Idempotente.

ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS checkpoint_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temas_escucha_activa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.acta_grabacion_sesion.checkpoint_chars IS
  'Offset en transcripcion desde el cual el próximo Actualizar analiza el tramo.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_escucha_activa IS
  'True cuando se habilitó el TAB Temas y la sesión presta atención al audio para Temas.';

NOTIFY pgrst, 'reload schema';
