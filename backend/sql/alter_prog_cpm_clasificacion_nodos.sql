-- CPM — distinguir ruta crítica real (holgura 0 + sucesores) vs actividad final del tramo
BEGIN;

ALTER TABLE public.prog_cpm_resultados
  ADD COLUMN IF NOT EXISTS tiene_sucesores boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_actividad_final_tramo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.prog_cpm_resultados.tiene_sucesores IS
  'True si el nodo tiene al menos una dependencia saliente en el grafo CPM.';
COMMENT ON COLUMN public.prog_cpm_resultados.es_actividad_final_tramo IS
  'True si holgura=0 y no tiene sucesores (último nodo de la cadena del tramo).';

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
        holgura_total, holgura_libre, es_ruta_critica,
        tiene_sucesores, es_actividad_final_tramo,
        calculado_en
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
        COALESCE((r->>'tiene_sucesores')::boolean, false),
        COALESCE((r->>'es_actividad_final_tramo')::boolean, false),
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
