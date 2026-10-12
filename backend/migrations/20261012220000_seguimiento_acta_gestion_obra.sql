-- Snapshot de «Gestión de obra» en el acta (rango, datos consolidados, observaciones).
-- Congelado al sellar el acta (realizada/firmada) para que no cambie con registros posteriores.

ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS gestion_obra jsonb;

COMMENT ON COLUMN public.seguimiento_acta.gestion_obra IS
  'Consolidado semanal de gestión de obra: {fecha_desde,fecha_hasta,snapshot_at,datos,observaciones}.';
