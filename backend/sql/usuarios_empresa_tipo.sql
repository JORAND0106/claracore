-- Empresa del usuario dentro del contrato (Gestión de usuarios).
-- Renombra conceptualmente el vínculo «Subcontratista» → «Empresa».
-- Idempotente.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS empresa_tipo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_empresa_tipo_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_empresa_tipo_check
      CHECK (
        empresa_tipo IS NULL
        OR empresa_tipo IN ('contratista', 'interventoria', 'subcontratista')
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Migrar vínculos existentes: subcontratista_id → empresa_tipo = subcontratista
UPDATE public.usuarios
SET empresa_tipo = 'subcontratista'
WHERE subcontratista_id IS NOT NULL
  AND (empresa_tipo IS NULL OR btrim(empresa_tipo) = '');

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_tipo
  ON public.usuarios (empresa_tipo)
  WHERE empresa_tipo IS NOT NULL;

COMMENT ON COLUMN public.usuarios.empresa_tipo IS
  'Empresa del usuario en el contrato: contratista | interventoria | subcontratista. Aislamiento solo si es subcontratista.';

COMMENT ON COLUMN public.usuarios.subcontratista_id IS
  'FK al subcontratista cuando empresa_tipo = subcontratista. Independiente del cargo; obligatorio si el cargo es Subcontratista.';

-- Cargo Coordinador de Topografía (si no existe)
INSERT INTO public.cargos (nombre)
SELECT 'Coordinador de Topografía'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos
  WHERE lower(btrim(nombre)) = lower('Coordinador de Topografía')
);

-- Función Reporte de Cantidades (asegurar existencia)
INSERT INTO public.funciones (nombre)
SELECT 'Reporte de Cantidades'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones
  WHERE lower(btrim(nombre)) = lower('Reporte de Cantidades')
);

-- Función Topografía (asegurar existencia)
INSERT INTO public.funciones (nombre)
SELECT 'Topografía'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones
  WHERE lower(btrim(nombre)) = lower('Topografía')
);

-- Permisos acotados del Coordinador de Topografía (legacy contrato_id NULL):
-- Reporte de Cantidades: ver + crear (sin editar/eliminar/validar/exportar extras no pedidos)
-- Topografía: ver + editar (coordinación)
-- No modifica permisos de otros cargos.
WITH cargo AS (
  SELECT id FROM public.cargos
  WHERE lower(btrim(nombre)) = lower('Coordinador de Topografía')
  LIMIT 1
),
fn_rc AS (
  SELECT id FROM public.funciones
  WHERE lower(btrim(nombre)) = lower('Reporte de Cantidades')
  LIMIT 1
),
fn_topo AS (
  SELECT id FROM public.funciones
  WHERE lower(btrim(nombre)) = lower('Topografía')
  LIMIT 1
)
INSERT INTO public.permisos (
  cargo_id, funcion_id, contrato_id,
  ver, crear, editar, eliminar, validar, exportar
)
SELECT c.id, f.id, NULL::integer, true, true, false, false, false, false
FROM cargo c, fn_rc f
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos p
  WHERE p.cargo_id = c.id AND p.funcion_id = f.id AND p.contrato_id IS NULL
)
UNION ALL
SELECT c.id, f.id, NULL::integer, true, false, true, false, false, false
FROM cargo c, fn_topo f
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos p
  WHERE p.cargo_id = c.id AND p.funcion_id = f.id AND p.contrato_id IS NULL
);

-- Copiar matriz acotada a cada contrato que ya tenga filas de permisos
-- (sin tocar otros cargos).
INSERT INTO public.permisos (
  cargo_id, funcion_id, contrato_id,
  ver, crear, editar, eliminar, validar, exportar
)
SELECT
  src.cargo_id,
  src.funcion_id,
  c.id AS contrato_id,
  src.ver, src.crear, src.editar, src.eliminar, src.validar, src.exportar
FROM public.permisos src
JOIN public.cargos cg ON cg.id = src.cargo_id
CROSS JOIN public.contratos c
WHERE lower(btrim(cg.nombre)) = lower('Coordinador de Topografía')
  AND src.contrato_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.permisos px WHERE px.contrato_id = c.id LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos p2
    WHERE p2.cargo_id = src.cargo_id
      AND p2.funcion_id = src.funcion_id
      AND p2.contrato_id = c.id
  );

NOTIFY pgrst, 'reload schema';
