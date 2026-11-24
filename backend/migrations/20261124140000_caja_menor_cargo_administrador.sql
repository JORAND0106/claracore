-- ClaraCore — Caja Menor: el cargo Administrador valida, ve y exporta.
-- Idempotente. La gerencia del contrato es el cargo, no un rol llamado Administrador.
-- Ejecutar en Supabase SQL Editor si la migración no corre sola.

DO $$
DECLARE
  fid integer;
  cargo_adm integer;
BEGIN
  SELECT f.id INTO fid
  FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'CAJMEN'
     OR lower(trim(coalesce(f.nombre, ''))) IN ('caja menor', 'cajamenor')
  ORDER BY f.id
  LIMIT 1;

  IF fid IS NULL THEN
    RETURN;
  END IF;

  FOR cargo_adm IN
    SELECT c.id
    FROM public.cargos c
    WHERE lower(regexp_replace(
      translate(trim(coalesce(c.nombre, '')), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'),
      '\s+', ' ', 'g'
    )) = 'administrador'
  LOOP
    UPDATE public.permisos
    SET ver = true, validar = true, exportar = true
    WHERE cargo_id = cargo_adm AND funcion_id = fid;

    INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
    SELECT cargo_adm, fid, NULL, true, false, false, false, true, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permisos p
      WHERE p.cargo_id = cargo_adm AND p.funcion_id = fid AND p.contrato_id IS NULL
    );

    INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
    SELECT cargo_adm, fid, c.id, true, false, false, false, true, true
    FROM public.contratos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permisos p
      WHERE p.cargo_id = cargo_adm AND p.funcion_id = fid AND p.contrato_id = c.id
    );
  END LOOP;
END $$;
