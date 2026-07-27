-- ClaraCore: función «Seguimiento» (matriz Control de accesos).
-- Idempotente. El esquema completo está en migrations/20260726000000_seguimiento_modulo.sql.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'SEGUIMIENTO', 'Seguimiento', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'seguimiento'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
);

-- Permisos seed: cargo Desarrollador → Seguimiento (todas las acciones).
-- El runtime también otorga acceso total sintético a Desarrollador; esto deja la matriz
-- de Control de accesos coherente sin paso manual.
INSERT INTO public.permisos (
  cargo_id, funcion_id,
  ver, crear, editar, eliminar, validar, exportar,
  contrato_id
)
SELECT
  c.id,
  f.id,
  true, true, true, true, true, true,
  NULL
FROM public.cargos c
CROSS JOIN public.funciones f
WHERE lower(trim(c.nombre)) = 'desarrollador'
  AND (
    lower(trim(f.nombre)) = 'seguimiento'
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.permisos p
    WHERE p.cargo_id = c.id
      AND p.funcion_id = f.id
      AND p.contrato_id IS NULL
  );

UPDATE public.permisos p
SET
  ver = true,
  crear = true,
  editar = true,
  eliminar = true,
  validar = true,
  exportar = true
FROM public.cargos c
JOIN public.funciones f ON true
WHERE p.cargo_id = c.id
  AND p.funcion_id = f.id
  AND lower(trim(c.nombre)) = 'desarrollador'
  AND (
    lower(trim(f.nombre)) = 'seguimiento'
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
  );
