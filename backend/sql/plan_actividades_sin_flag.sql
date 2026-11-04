-- ClaraCore — Quitar flag de habilitación del Plan de actividades (manual Supabase)
-- Ver también: migrations/20261104020000_plan_actividades_sin_flag.sql

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado_por;

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado_en;

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado;

NOTIFY pgrst, 'reload schema';
