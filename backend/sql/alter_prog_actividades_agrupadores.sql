-- Programación de Obra — vínculo con agrupadores WBS (Listado de Precios)
-- Revisar antes de ejecutar en Supabase.
--
-- Propósito:
--   - prog_actividades puede representar una fila de agrupador (item = codigo_wbs)
--   - Los ítems hijos heredan fechas con heredado_de_capitulo = TRUE
--
-- Dependencias:
--   - listado_precios_agrupadores (ver listado_precios_agrupadores.sql)

BEGIN;

ALTER TABLE public.prog_actividades
  ADD COLUMN IF NOT EXISTS agrupador_id BIGINT
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo_wbs VARCHAR(50);

COMMENT ON COLUMN public.prog_actividades.agrupador_id IS
  'Agrupador WBS cuando la actividad es padre (programación por agrupador) o hijo heredado.';

COMMENT ON COLUMN public.prog_actividades.codigo_wbs IS
  'Código WBS del agrupador (ej. 2.A). En filas padre coincide con item.';

CREATE INDEX IF NOT EXISTS idx_prog_act_agrupador_id
  ON public.prog_actividades (agrupador_id)
  WHERE agrupador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prog_act_codigo_wbs
  ON public.prog_actividades (version_id, pk_id, capitulo, codigo_wbs)
  WHERE codigo_wbs IS NOT NULL AND length(trim(codigo_wbs)) > 0;

COMMIT;
