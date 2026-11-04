-- ClaraCore — Plan de actividades (espejo manual para Supabase)
-- Ver también: migrations/20261104010000_plan_actividades.sql

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado boolean NOT NULL DEFAULT false;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado_en timestamptz NULL;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado_por integer NULL
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'seguimiento_item'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%origen%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.seguimiento_item DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE public.seguimiento_item
    ADD CONSTRAINT seguimiento_item_origen_check
    CHECK (origen IN ('compromiso', 'tarea', 'plan_actividad'));
END $$;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS mensaje_anterior text NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_en timestamptz NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_por_id integer NULL
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_por_nombre text NULL;

CREATE TABLE IF NOT EXISTS public.seguimiento_plan_grupo (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_by integer NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_plan_grupo_nombre_len CHECK (char_length(trim(nombre)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seguimiento_plan_grupo_contrato_nombre
  ON public.seguimiento_plan_grupo (contrato_id, lower(trim(nombre)));

CREATE INDEX IF NOT EXISTS idx_seguimiento_plan_grupo_contrato
  ON public.seguimiento_plan_grupo (contrato_id);

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'PLANACT', 'Plan de actividades', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'PLANACT'
     OR lower(trim(coalesce(f.nombre, ''))) IN ('plan de actividades', 'planactividades')
);

NOTIFY pgrst, 'reload schema';
