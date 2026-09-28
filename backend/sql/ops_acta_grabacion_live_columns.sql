-- ClaraCore OPS — Columnas de grabación en vivo (STT / Temas por checkpoint).
-- Idempotente. Ejecutar en Supabase SQL Editor si aparece PGRST204:
--   Could not find the 'transcripcion' column of 'acta_grabacion_sesion'
--
-- Incluye columnas de:
--   20260915010000_acta_grabacion_live_temas.sql
--   20260915160000_acta_grabacion_temas_checkpoint.sql
--   20260928150000_acta_grabacion_tramos.sql
-- y fuerza recarga del schema cache de PostgREST.

ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS transcripcion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS temas_propuestos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sintesis_en timestamptz,
  ADD COLUMN IF NOT EXISTS checkpoint_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temas_escucha_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_tramo_estado text,
  ADD COLUMN IF NOT EXISTS tramos_error_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.acta_grabacion_sesion.transcripcion IS
  'Texto STT acumulado de la sesión (audio real vía Azure Speech). Base para síntesis de Temas.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_propuestos IS
  'JSON de temas sintetizados [{clave,titulo,texto,interviniente}] — no compromisos.';
COMMENT ON COLUMN public.acta_grabacion_sesion.checkpoint_chars IS
  'Offset en transcripcion desde el cual el próximo checkpoint analiza el tramo.';
COMMENT ON COLUMN public.acta_grabacion_sesion.temas_escucha_activa IS
  'True cuando se habilitó el TAB Temas y la sesión presta atención al audio para Temas.';

CREATE TABLE IF NOT EXISTS public.acta_grabacion_tramo (
  id                bigserial PRIMARY KEY,
  sesion_id         bigint NOT NULL
                      REFERENCES public.acta_grabacion_sesion(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  origen            text NOT NULL DEFAULT 'auto'
                      CHECK (origen IN ('auto', 'manual', 'final', 'reintento')),
  estado            text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'procesando', 'listo', 'error')),
  checkpoint_inicio integer NOT NULL DEFAULT 0,
  checkpoint_fin    integer,
  chars_tramo       integer NOT NULL DEFAULT 0,
  cola_previa       text,
  transcripcion     text,
  error_detalle     text,
  intentos          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acta_grabacion_tramo_sesion
  ON public.acta_grabacion_tramo (sesion_id, orden);

-- Recarga schema cache (PostgREST / Supabase API).
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
