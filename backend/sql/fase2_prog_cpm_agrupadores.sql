-- CPM — resultados por agrupador WBS (evita violación de unique al programar por agrupador)
-- Idempotente en lo posible.

BEGIN;

ALTER TABLE public.prog_cpm_resultados
  ADD COLUMN IF NOT EXISTS agrupador_id BIGINT
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.prog_cpm_resultados.agrupador_id IS
  'Nodo CPM agrupador WBS; NULL = nodo a nivel capítulo completo.';

ALTER TABLE public.prog_cpm_resultados
  DROP CONSTRAINT IF EXISTS prog_cpm_resultados_unique;

DROP INDEX IF EXISTS public.prog_cpm_resultados_unique;

CREATE UNIQUE INDEX prog_cpm_resultados_unique
  ON public.prog_cpm_resultados (version_id, pk_id, capitulo, COALESCE(agrupador_id, 0::bigint));

CREATE OR REPLACE FUNCTION public.prog_upsert_cpm_resultados(
  p_version_id uuid,
  p_contrato_id bigint,
  p_resultados jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_count int;
BEGIN
    DELETE FROM prog_cpm_resultados WHERE version_id = p_version_id;

    INSERT INTO prog_cpm_resultados (
        version_id, contrato_id, pk_id, capitulo, agrupador_id,
        fecha_inicio_temprana, fecha_fin_temprana,
        fecha_inicio_tardia,   fecha_fin_tardia,
        holgura_total, holgura_libre, es_ruta_critica, calculado_en
    )
    SELECT
        p_version_id,
        p_contrato_id,
        (r->>'pk_id')::varchar,
        (r->>'capitulo')::varchar,
        NULLIF(r->>'agrupador_id', '')::bigint,
        (r->>'fecha_inicio_temprana')::date,
        (r->>'fecha_fin_temprana')::date,
        (r->>'fecha_inicio_tardia')::date,
        (r->>'fecha_fin_tardia')::date,
        (r->>'holgura_total')::int,
        (r->>'holgura_libre')::int,
        COALESCE((r->>'es_ruta_critica')::boolean, false),
        now()
    FROM jsonb_array_elements(p_resultados) AS r;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE prog_versiones
    SET cpm_calculado_en = now(),
        cpm_dirty        = FALSE,
        actualizado_en   = now()
    WHERE id = p_version_id;

    RETURN jsonb_build_object('ok', true, 'nodos', v_count);
END;
$function$;

COMMIT;
