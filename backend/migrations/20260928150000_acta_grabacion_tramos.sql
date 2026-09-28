-- ClaraCore — Tramos de Temas por checkpoint (auto ~5 min / manual / final).
-- Idempotente. No almacena audio; registra estado de cada tramo de síntesis.

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

CREATE INDEX IF NOT EXISTS idx_acta_grabacion_tramo_estado
  ON public.acta_grabacion_tramo (sesion_id, estado)
  WHERE estado IN ('pendiente', 'procesando', 'error');

COMMENT ON TABLE public.acta_grabacion_tramo IS
  'Tramos de síntesis de Temas (checkpoint auto/manual/final). Orden cronológico; fallos quedan en error para reintento.';

COMMENT ON COLUMN public.acta_grabacion_tramo.cola_previa IS
  'Cola del tramo anterior (solape) para conectar ideas partidas sin duplicar.';

ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS ultimo_tramo_estado text,
  ADD COLUMN IF NOT EXISTS tramos_error_count integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
