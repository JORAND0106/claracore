-- ClaraCore — Transcripción acumulada y temas propuestos en vivo (sin audio persistente).
-- Idempotente.

ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS transcripcion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS temas_propuestos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sintesis_en timestamptz;

COMMENT ON COLUMN public.acta_grabacion_sesion.transcripcion IS
  'Texto STT acumulado de la sesión (sin audio). Se usa solo para síntesis de Temas.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_propuestos IS
  'JSON de temas sintetizados [{clave,titulo,texto,interviniente}] — no compromisos.';

NOTIFY pgrst, 'reload schema';
