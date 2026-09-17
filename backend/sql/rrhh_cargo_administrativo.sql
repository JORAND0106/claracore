-- ClaraCore — Cargo «Administrativo» + permisos RRHH / módulos de obra
-- Mirror de migrations/20260917210000_rrhh_cargo_administrativo.sql

INSERT INTO public.cargos (nombre)
SELECT 'Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos c
  WHERE lower(trim(coalesce(c.nombre::text, ''))) = 'administrativo'
);

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
  v_cargo_id integer;
  v_func RECORD;
BEGIN
  SELECT id INTO v_cargo_id FROM public.cargos
  WHERE lower(trim(coalesce(nombre::text, ''))) = 'administrativo'
  LIMIT 1;

  IF v_cargo_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_func IN
    SELECT id FROM public.funciones
    WHERE upper(trim(coalesce(codigo::text, ''))) IN (
      'RRHH', 'SEGUIMIENTO', 'BITACORA', 'ALMACEN', 'CATINS',
      'PROGOB', 'DASHBOARD', 'INFCCD', 'AUDSST'
    )
    OR lower(trim(coalesce(nombre::text, ''))) IN (
      'recursos humanos', 'rrhh', 'seguimiento', 'bitácora', 'bitacora',
      'almacén', 'almacen', 'catálogo de insumos', 'catalogo de insumos',
      'programación de obra', 'programacion de obra', 'dashboard',
      'informes ccd', 'auditor sst (ia)'
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.permisos
      WHERE cargo_id = v_cargo_id
        AND funcion_id = v_func.id
        AND contrato_id IS NULL
    ) THEN
      INSERT INTO public.permisos (
        cargo_id, funcion_id, contrato_id,
        ver, crear, editar, eliminar, validar, exportar
      ) VALUES (
        v_cargo_id, v_func.id, NULL,
        true, true, true, true, true, true
      );
    ELSE
      UPDATE public.permisos
      SET ver = true,
          crear = true,
          editar = true,
          eliminar = true,
          validar = true,
          exportar = true
      WHERE cargo_id = v_cargo_id
        AND funcion_id = v_func.id
        AND contrato_id IS NULL;
    END IF;
  END LOOP;
END $$;

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
