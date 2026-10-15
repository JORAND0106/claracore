-- ClaraCore — RRHH: habilitar permiso Exportar para el informe
-- «Estado documental de colaboradores» (CC-RRHH-DOC-001).
--
-- Este informe NO crea tablas nuevas: usa rrhh_trabajadores,
-- rrhh_trabajador_documentos, rrhh_contratos_generados y catálogo.
-- Solo se requiere el flag `exportar` en la matriz Control de accesos
-- para la función Recursos Humanos / RRHH.
--
-- Idempotente. Ejecutar en Supabase SQL Editor (o psql).

-- 1) Asegurar que exista la función RRHH
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'RRHH', 'Recursos Humanos', 'Gestión'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(f.nombre::text, ''))) IN ('rrhh', 'recursos humanos')
);

-- 2) Activar Exportar en cargos que ya tienen Ver en RRHH
--    (ajusta la lista de cargos si Calidad/RRHH usa otros nombres)
DO $$
DECLARE
  v_func_id integer;
  r record;
BEGIN
  SELECT id INTO v_func_id
  FROM public.funciones
  WHERE upper(trim(coalesce(codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(nombre::text, ''))) IN ('rrhh', 'recursos humanos')
  LIMIT 1;

  IF v_func_id IS NULL THEN
    RAISE NOTICE 'No se encontró la función RRHH / Recursos Humanos.';
    RETURN;
  END IF;

  -- Cargos típicos que deben poder generar el informe
  FOR r IN
    SELECT c.id AS cargo_id, c.nombre
    FROM public.cargos c
    WHERE lower(trim(coalesce(c.nombre::text, ''))) IN (
      'desarrollador',
      'administrador',
      'administrativo',
      'coordinador rrhh',
      'coordinador de rrhh',
      'analista rrhh',
      'analista de rrhh',
      'auxiliar rrhh',
      'auxiliar de rrhh',
      'gestor rrhh',
      'gestor de rrhh'
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.permisos p
      WHERE p.cargo_id = r.cargo_id
        AND p.funcion_id = v_func_id
        AND p.contrato_id IS NULL
    ) THEN
      UPDATE public.permisos
      SET exportar = true,
          ver = true
      WHERE cargo_id = r.cargo_id
        AND funcion_id = v_func_id
        AND contrato_id IS NULL;
    ELSE
      INSERT INTO public.permisos (
        cargo_id, funcion_id, contrato_id,
        ver, crear, editar, eliminar, validar, exportar
      ) VALUES (
        r.cargo_id, v_func_id, NULL,
        true, false, false, false, false, true
      );
    END IF;
    RAISE NOTICE 'Exportar RRHH habilitado para cargo: %', r.nombre;
  END LOOP;
END $$;

-- 3) Verificación rápida
SELECT
  c.nombre AS cargo,
  p.ver,
  p.crear,
  p.editar,
  p.eliminar,
  p.validar,
  p.exportar
FROM public.permisos p
JOIN public.cargos c ON c.id = p.cargo_id
JOIN public.funciones f ON f.id = p.funcion_id
WHERE (
  upper(trim(coalesce(f.codigo::text, ''))) = 'RRHH'
  OR lower(trim(coalesce(f.nombre::text, ''))) IN ('rrhh', 'recursos humanos')
)
AND p.contrato_id IS NULL
ORDER BY c.nombre;

NOTIFY pgrst, 'reload schema';
