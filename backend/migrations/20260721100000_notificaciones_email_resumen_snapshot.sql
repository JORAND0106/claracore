-- Snapshot de valores del resumen de inicio de jornada (matriz + Ppto vs Cobro)
-- para comparación en el correo de fin de jornada del mismo día y contrato.

CREATE TABLE IF NOT EXISTS public.notificaciones_email_resumen_snapshot (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  matriz        jsonb NOT NULL DEFAULT '{}'::jsonb,
  capitulos     jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_email_resumen_snapshot_unique
    UNIQUE (contrato_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_notif_email_resumen_snapshot_fecha
  ON public.notificaciones_email_resumen_snapshot (fecha DESC, contrato_id);

COMMENT ON TABLE public.notificaciones_email_resumen_snapshot IS
  'Valores de matriz validación y Ppto vs Cobro al envío del resumen de inicio de jornada (9:00).';

ALTER TABLE public.notificaciones_email_resumen_snapshot ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
