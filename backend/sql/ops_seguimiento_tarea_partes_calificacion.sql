-- OPS idempotente: columnas padre/calificación + tabla de excepción.
-- Pegar/ejecutar completo en Supabase SQL editor.

ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS padre_id bigint REFERENCES public.seguimiento_item(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_padre
  ON public.seguimiento_item (padre_id)
  WHERE padre_id IS NOT NULL;

ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS calificacion_nota numeric(5,2),
  ADD COLUMN IF NOT EXISTS calificacion_resultado_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS calificacion_tope_fecha_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS calificacion_en timestamptz,
  ADD COLUMN IF NOT EXISTS calificacion_detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_inicial date,
  ADD COLUMN IF NOT EXISTS se_reprogramo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS se_reprogramo_tras_vencer boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.seguimiento_calificacion_excepcion (
  id                bigserial PRIMARY KEY,
  item_id           bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  solicitante_id    integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  solicitante_nombre text,
  aprobador_id      integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo            text NOT NULL DEFAULT '',
  soporte_nombre    text,
  soporte_blob_path text,
  soporte_mime      text,
  decision_nota     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_calif_exc_item
  ON public.seguimiento_calificacion_excepcion (item_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seguimiento_calif_exc_pendiente_uq
  ON public.seguimiento_calificacion_excepcion (item_id)
  WHERE estado = 'pendiente';

ALTER TABLE public.seguimiento_calificacion_excepcion ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
