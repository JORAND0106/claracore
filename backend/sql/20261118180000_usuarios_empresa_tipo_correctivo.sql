-- Correctivo: empresa_tipo=subcontratista mal aplicado (#1056) / re-envenenado al guardar.
-- El aislamiento de SicoeObra solo aplica a Empresa=subcontratista real.
-- Idempotente.

-- 1) Contratista / interventoría: nunca deben conservar sid de sub.
UPDATE public.usuarios
SET subcontratista_id = NULL
WHERE empresa_tipo IN ('contratista', 'interventoria')
  AND subcontratista_id IS NOT NULL;

-- 2) Usuarios tipificados como subcontratista cuyo rol es interventoría o
--    contratista/consorcio (no «sub…»): corregir tipo y limpiar sid.
UPDATE public.usuarios u
SET
  empresa_tipo = CASE
    WHEN lower(btrim(r.nombre)) LIKE '%intervent%' THEN 'interventoria'
    WHEN lower(btrim(r.nombre)) LIKE '%contratista%'
         AND lower(btrim(r.nombre)) NOT LIKE '%sub%' THEN 'contratista'
    ELSE u.empresa_tipo
  END,
  subcontratista_id = CASE
    WHEN lower(btrim(r.nombre)) LIKE '%intervent%' THEN NULL
    WHEN lower(btrim(r.nombre)) LIKE '%contratista%'
         AND lower(btrim(r.nombre)) NOT LIKE '%sub%' THEN NULL
    ELSE u.subcontratista_id
  END
FROM public.roles r
WHERE u.rol_id = r.id
  AND u.empresa_tipo = 'subcontratista'
  AND (
    lower(btrim(r.nombre)) LIKE '%intervent%'
    OR (
      lower(btrim(r.nombre)) LIKE '%contratista%'
      AND lower(btrim(r.nombre)) NOT LIKE '%sub%'
    )
  );

-- 3) Sid residual sin tipo: no es empresa sub → limpiar sid (sin inventar tipo).
UPDATE public.usuarios
SET subcontratista_id = NULL
WHERE subcontratista_id IS NOT NULL
  AND (empresa_tipo IS NULL OR btrim(empresa_tipo) = '');

COMMENT ON COLUMN public.usuarios.empresa_tipo IS
  'Empresa del usuario: contratista | interventoria | subcontratista. Aislamiento Sicoe solo si es subcontratista.';

NOTIFY pgrst, 'reload schema';
