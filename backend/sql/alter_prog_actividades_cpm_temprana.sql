-- Fechas CPM (write-back) separadas de fecha_inicio / fecha_fin_calculada (programación manual).
-- Ejecutar en Supabase antes de desplegar el backend con write-back a columnas temprana.

ALTER TABLE public.prog_actividades
  ADD COLUMN IF NOT EXISTS fecha_inicio_temprana date,
  ADD COLUMN IF NOT EXISTS fecha_fin_temprana date;

COMMENT ON COLUMN public.prog_actividades.fecha_inicio_temprana IS
  'Inicio temprano CPM (write-back del motor). No usar como entrada del forward pass.';

COMMENT ON COLUMN public.prog_actividades.fecha_fin_temprana IS
  'Fin temprano CPM (write-back del motor). No usar como entrada del forward pass.';

CREATE INDEX IF NOT EXISTS idx_prog_act_ag_temprana
  ON public.prog_actividades (version_id, agrupador_id)
  WHERE agrupador_id IS NOT NULL AND fecha_inicio_temprana IS NOT NULL;
