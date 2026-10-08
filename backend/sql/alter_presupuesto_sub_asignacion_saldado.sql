-- Mirror of migrations/20261008120000_presupuesto_sub_asignacion_saldado.sql
ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado boolean NOT NULL DEFAULT false;

ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado_at timestamptz;

ALTER TABLE public.presupuesto_sub_asignacion
  ADD COLUMN IF NOT EXISTS saldado_por integer;

ALTER TABLE public.presupuesto_sub_redistribucion
  ADD COLUMN IF NOT EXISTS decisiones jsonb NOT NULL DEFAULT '{}'::jsonb;
