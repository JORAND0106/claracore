-- ClaraCore — ROL «Administrativo» (no cargo) + revertir cargo erróneo
-- Mirror de migrations/20260917220000_rrhh_rol_administrativo.sql

INSERT INTO public.roles (nombre)
SELECT 'Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE lower(trim(coalesce(r.nombre::text, ''))) = 'administrativo'
);

DO $$
DECLARE
  v_cargo_id integer;
  v_rol_id integer;
BEGIN
  SELECT id INTO v_cargo_id FROM public.cargos
  WHERE lower(trim(coalesce(nombre::text, ''))) = 'administrativo'
  LIMIT 1;

  SELECT id INTO v_rol_id FROM public.roles
  WHERE lower(trim(coalesce(nombre::text, ''))) = 'administrativo'
  LIMIT 1;

  IF v_cargo_id IS NULL THEN
    RETURN;
  END IF;

  IF v_rol_id IS NOT NULL THEN
    UPDATE public.usuarios
    SET rol_id = v_rol_id,
        cargo_id = NULL
    WHERE cargo_id = v_cargo_id;
  ELSE
    UPDATE public.usuarios
    SET cargo_id = NULL
    WHERE cargo_id = v_cargo_id;
  END IF;

  DELETE FROM public.permisos WHERE cargo_id = v_cargo_id;
  DELETE FROM public.cargos WHERE id = v_cargo_id;
END $$;

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'RRHH', 'Recursos Humanos', 'Gestión'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(f.nombre::text, ''))) IN ('rrhh', 'recursos humanos')
);

UPDATE public.funciones
SET nombre = 'Recursos Humanos'
WHERE upper(trim(coalesce(codigo::text, ''))) = 'RRHH'
  AND lower(trim(coalesce(nombre::text, ''))) = 'rrhh';

DO $$
DECLARE
  v_func_id integer;
  v_cargo_id integer;
BEGIN
  SELECT id INTO v_func_id FROM public.funciones
  WHERE upper(trim(coalesce(codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(nombre::text, ''))) IN ('rrhh', 'recursos humanos')
  LIMIT 1;

  SELECT id INTO v_cargo_id FROM public.cargos
  WHERE lower(trim(coalesce(nombre::text, ''))) = 'administrador'
  LIMIT 1;

  IF v_func_id IS NULL OR v_cargo_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.permisos
    WHERE cargo_id = v_cargo_id AND funcion_id = v_func_id AND contrato_id IS NULL
  ) THEN
    INSERT INTO public.permisos (
      cargo_id, funcion_id, contrato_id,
      ver, crear, editar, eliminar, validar, exportar
    ) VALUES (
      v_cargo_id, v_func_id, NULL,
      true, true, true, true, true, true
    );
  ELSE
    UPDATE public.permisos
    SET ver = true, crear = true, editar = true,
        eliminar = true, validar = true, exportar = true
    WHERE cargo_id = v_cargo_id
      AND funcion_id = v_func_id
      AND contrato_id IS NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
