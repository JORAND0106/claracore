-- ClaraCore — Plan de actividades: eliminar flag de habilitación por contrato.
-- El acceso queda solo por permisos (función PLANACT). Idempotente.

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado_por;

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado_en;

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS plan_actividades_habilitado;

NOTIFY pgrst, 'reload schema';
