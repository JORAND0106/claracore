-- Programacion de Obra — corregir constraint prog_dependencias_no_self
-- REVISAR antes de ejecutar en Supabase.
--
-- Problema:
--   El constraint original bloqueaba dependencias entre agrupadores distintos
--   del mismo capitulo y mismo PK (ej. 2.A -> 2.F en PK 120114), porque
--   pk_id_origen = pk_id_destino y capitulo_origen = capitulo_destino.
--
-- Solucion:
--   Permitir el vinculo cuando ambos lados son agrupadores distintos
--   (agrupador_id_origen <> agrupador_id_destino).
--
-- Prerequisitos:
--   - Columnas agrupador_id_origen / agrupador_id_destino (BIGINT) ya creadas
--     via alter_prog_dependencias_agrupadores.sql

ALTER TABLE public.prog_dependencias
  DROP CONSTRAINT IF EXISTS prog_dependencias_no_self;

ALTER TABLE public.prog_dependencias
  ADD CONSTRAINT prog_dependencias_no_self CHECK (
    pk_id_origen <> pk_id_destino
    OR capitulo_origen <> capitulo_destino
    OR (
      agrupador_id_origen IS NOT NULL
      AND agrupador_id_destino IS NOT NULL
      AND agrupador_id_origen <> agrupador_id_destino
    )
  );

COMMENT ON CONSTRAINT prog_dependencias_no_self ON public.prog_dependencias IS
  'Impide auto-dependencia salvo entre agrupadores WBS distintos del mismo capitulo/PK.';
