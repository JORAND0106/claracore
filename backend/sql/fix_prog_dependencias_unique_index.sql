-- Programacion de Obra — corregir indice unico prog_dependencias_unique
-- REVISAR antes de ejecutar en Supabase.
--
-- Problema:
--   El constraint prog_dependencias_unique original solo incluia
--   (version_id, pk_id_origen, capitulo_origen, pk_id_destino, capitulo_destino, tipo)
--   sin agrupador_id_origen / agrupador_id_destino.
--   Una dependencia a nivel capitulo y otra a nivel agrupador entre el mismo par
--   se consideraban duplicadas → error "duplicate key prog_dependencias_unique".
--
-- Nota:
--   prog_dependencias_unique es un CONSTRAINT UNIQUE (no un indice suelto).
--   Hay que eliminar el constraint; eso elimina automaticamente el indice asociado.
--
-- Prerequisitos:
--   - Columnas agrupador_id_origen / agrupador_id_destino ya creadas
--     (alter_prog_dependencias_agrupadores.sql)

-- Constraint legacy (sin agrupadores) — elimina tambien su indice subyacente
ALTER TABLE public.prog_dependencias
  DROP CONSTRAINT IF EXISTS prog_dependencias_unique;

-- Indice alternativo creado en alter_prog_dependencias_agrupadores.sql (sin tipo), si existiera
DROP INDEX IF EXISTS public.prog_dependencias_unique_vinculo;

CREATE UNIQUE INDEX prog_dependencias_unique
  ON public.prog_dependencias (
    version_id,
    pk_id_origen,
    capitulo_origen,
    COALESCE(agrupador_id_origen::text, ''),
    pk_id_destino,
    capitulo_destino,
    COALESCE(agrupador_id_destino::text, ''),
    tipo
  );

COMMENT ON INDEX public.prog_dependencias_unique IS
  'Un vinculo unico por version, origen (capitulo o agrupador), destino (capitulo o agrupador) y tipo FS/SS/FF/SF.';
