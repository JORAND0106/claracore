-- ClaraCore OPS — Columnas de grabación en vivo (STT / Temas por checkpoint).
-- Idempotente. Ejecutar en Supabase SQL Editor si aparece PGRST204:
--   Could not find the 'transcripcion' column of 'acta_grabacion_sesion'
--
-- Incluye columnas de:
--   20260915010000_acta_grabacion_live_temas.sql
--   20260915160000_acta_grabacion_temas_checkpoint.sql
-- y fuerza recarga del schema cache de PostgREST.

ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS transcripcion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS temas_propuestos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sintesis_en timestamptz,
  ADD COLUMN IF NOT EXISTS checkpoint_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temas_escucha_activa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.acta_grabacion_sesion.transcripcion IS
  'Texto STT acumulado de la sesión (sin audio). Se usa solo para síntesis de Temas.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_propuestos IS
  'JSON de temas sintetizados [{clave,titulo,texto,interviniente}] — no compromisos.';
COMMENT ON COLUMN public.acta_grabacion_sesion.checkpoint_chars IS
  'Offset en transcripcion desde el cual el próximo Actualizar analiza el tramo.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_escucha_activa IS
  'True cuando se habilitó el TAB Temas y la sesión presta atención al audio para Temas.';

-- Recarga schema cache (PostgREST / Supabase API).
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- Verificación rápida (debe listar las 5 columnas):
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'acta_grabacion_sesion'
--   AND column_name IN (
--     'transcripcion','temas_propuestos','ultima_sintesis_en',
--     'checkpoint_chars','temas_escucha_activa'
--   )
-- ORDER BY 1;
