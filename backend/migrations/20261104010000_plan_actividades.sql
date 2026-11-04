-- ClaraCore — Plan de actividades (Seguimiento)
-- Submódulo opt-in por contrato, con grupos propios y función de permisos.
-- Idempotente.

-- 1) Flag de habilitación por contrato (solo Desarrollador lo cambia vía API)
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado boolean NOT NULL DEFAULT false;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado_en timestamptz NULL;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS plan_actividades_habilitado_por integer NULL
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contratos.plan_actividades_habilitado IS
  'Habilita el submódulo Plan de actividades en Seguimiento. Deshabilitado por defecto; solo Desarrollador puede cambiarlo.';

-- 2) Origen plan_actividad en seguimiento_item
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

-- 3) Historial de edición de comentarios (no se borran; si se editan queda rastro)
ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS mensaje_anterior text NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_en timestamptz NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_por_id integer NULL
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.seguimiento_item_comentario
  ADD COLUMN IF NOT EXISTS editado_por_nombre text NULL;

-- 4) Grupos de actividades por contrato
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

COMMENT ON TABLE public.seguimiento_plan_grupo IS
  'Grupos (bandas) del Plan de actividades; aislados por contrato.';

-- 5) Función de permisos (Control de accesos)
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'PLANACT', 'Plan de actividades', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'PLANACT'
     OR lower(trim(coalesce(f.nombre, ''))) IN ('plan de actividades', 'planactividades')
);

-- Sembrar permisos totales para Desarrollador en todos los contratos (y legacy null)
DO $$
DECLARE
  fid integer;
  cargo_dev integer;
BEGIN
  SELECT f.id INTO fid
  FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'PLANACT'
     OR lower(trim(coalesce(f.nombre, ''))) = 'plan de actividades'
  ORDER BY f.id
  LIMIT 1;

  SELECT c.id INTO cargo_dev
  FROM public.cargos c
  WHERE lower(trim(coalesce(c.nombre, ''))) = 'desarrollador'
  ORDER BY c.id
  LIMIT 1;

  IF fid IS NULL OR cargo_dev IS NULL THEN
    RETURN;
  END IF;

  -- Legacy (sin contrato)
  INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
  SELECT cargo_dev, fid, NULL, true, true, true, true, true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.cargo_id = cargo_dev AND p.funcion_id = fid AND p.contrato_id IS NULL
  );

  -- Por contrato existente
  INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
  SELECT cargo_dev, fid, c.id, true, true, true, true, true, true
  FROM public.contratos c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.cargo_id = cargo_dev AND p.funcion_id = fid AND p.contrato_id = c.id
  );
END $$;

NOTIFY pgrst, 'reload schema';
