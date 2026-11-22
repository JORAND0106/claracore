-- Extiende prog_clone_version para copiar subsectores PK y sus líneas.
-- Idempotente: reemplaza la función completa.

CREATE OR REPLACE FUNCTION public.prog_clone_version(
  p_origen_id uuid,
  p_destino_id uuid,
  p_contrato_id bigint,
  p_usuario_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_origen_estado text;
  v_destino_estado text;
  v_n_cap int := 0;
  v_n_act int := 0;
  v_n_dist int := 0;
  v_n_dep int := 0;
  v_n_dep_g int := 0;
  v_n_cpm int := 0;
  v_n_sub int := 0;
  v_n_sub_lin int := 0;
BEGIN
  SELECT estado INTO v_origen_estado
  FROM public.prog_versiones
  WHERE id = p_origen_id AND contrato_id = p_contrato_id;

  IF v_origen_estado IS NULL THEN
    RAISE EXCEPTION 'prog_clone_version: origen % no encontrada en contrato %', p_origen_id, p_contrato_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_origen_estado NOT IN ('sellada', 'archivada') THEN
    RAISE EXCEPTION 'prog_clone_version: origen debe estar sellada o archivada (estado=%)', v_origen_estado
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT estado INTO v_destino_estado
  FROM public.prog_versiones
  WHERE id = p_destino_id AND contrato_id = p_contrato_id;

  IF v_destino_estado IS NULL THEN
    RAISE EXCEPTION 'prog_clone_version: destino % no encontrada en contrato %', p_destino_id, p_contrato_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_destino_estado <> 'borrador' THEN
    RAISE EXCEPTION 'prog_clone_version: destino debe estar en borrador (estado=%)', v_destino_estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_origen_id = p_destino_id THEN
    RAISE EXCEPTION 'prog_clone_version: origen y destino deben ser distintas'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.prog_actividades
    WHERE version_id = p_destino_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'prog_clone_version: destino ya tiene actividades; elimine la version borrador vacia primero'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.prog_cpm_resultados WHERE version_id = p_destino_id;
  DELETE FROM public.prog_dependencias WHERE version_id = p_destino_id;
  DELETE FROM public.prog_dependencias_globales WHERE version_id = p_destino_id;
  DELETE FROM public.prog_actividades_capitulo WHERE version_id = p_destino_id;
  IF to_regclass('public.prog_pk_subsector_lineas') IS NOT NULL THEN
    DELETE FROM public.prog_pk_subsector_lineas WHERE version_id = p_destino_id;
  END IF;
  IF to_regclass('public.prog_pk_subsectores') IS NOT NULL THEN
    DELETE FROM public.prog_pk_subsectores WHERE version_id = p_destino_id;
  END IF;

  -- Subsectores (mapa id origen → destino)
  IF to_regclass('public.prog_pk_subsectores') IS NOT NULL THEN
    CREATE TEMP TABLE IF NOT EXISTS _prog_sub_map (
      old_id uuid PRIMARY KEY,
      new_id uuid NOT NULL
    ) ON COMMIT DROP;
    DELETE FROM _prog_sub_map;

    INSERT INTO public.prog_pk_subsectores (
      version_id, contrato_id, pk_id, orden,
      abs_inicio_m, abs_final_m, abs_inicio_label, abs_final_label,
      geojson, modo_reparto, creado_por, creado_en, actualizado_en
    )
    SELECT
      p_destino_id, contrato_id, pk_id, orden,
      abs_inicio_m, abs_final_m, abs_inicio_label, abs_final_label,
      geojson, modo_reparto, p_usuario_id, now(), now()
    FROM public.prog_pk_subsectores
    WHERE version_id = p_origen_id;
    GET DIAGNOSTICS v_n_sub = ROW_COUNT;

    INSERT INTO _prog_sub_map (old_id, new_id)
    SELECT o.id, n.id
    FROM public.prog_pk_subsectores o
    INNER JOIN public.prog_pk_subsectores n
      ON n.version_id = p_destino_id
     AND n.pk_id = o.pk_id
     AND n.abs_inicio_m = o.abs_inicio_m
     AND n.abs_final_m = o.abs_final_m
    WHERE o.version_id = p_origen_id;

    IF to_regclass('public.prog_pk_subsector_lineas') IS NOT NULL THEN
      INSERT INTO public.prog_pk_subsector_lineas (
        subsector_id, version_id, contrato_id, pk_id,
        capitulo, item, presupuesto_linea_key,
        cantidad, cantidad_total_linea, modo, creado_en, actualizado_en
      )
      SELECT
        m.new_id, p_destino_id, l.contrato_id, l.pk_id,
        l.capitulo, l.item, l.presupuesto_linea_key,
        l.cantidad, l.cantidad_total_linea, l.modo, now(), now()
      FROM public.prog_pk_subsector_lineas l
      INNER JOIN _prog_sub_map m ON m.old_id = l.subsector_id
      WHERE l.version_id = p_origen_id;
      GET DIAGNOSTICS v_n_sub_lin = ROW_COUNT;
    END IF;
  END IF;

  INSERT INTO public.prog_actividades_capitulo (
    version_id, contrato_id, pk_id, capitulo,
    fecha_inicio_sugerida, duracion_dias_habiles, aplica_herencia,
    creado_por, actualizado_en
  )
  SELECT
    p_destino_id, contrato_id, pk_id, capitulo,
    fecha_inicio_sugerida, duracion_dias_habiles, aplica_herencia,
    p_usuario_id, now()
  FROM public.prog_actividades_capitulo
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_cap = ROW_COUNT;

  IF to_regclass('public.prog_pk_subsectores') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='prog_actividades' AND column_name='subsector_id') THEN
    INSERT INTO public.prog_actividades (
      version_id, contrato_id, pk_id, capitulo, item,
      fecha_inicio, duracion_dias_habiles, fecha_fin_calculada,
      cantidad_programada, unidad, costo_unitario,
      tipo_distribucion, heredado_de_capitulo, override_manual,
      segmento, creado_por, actualizado_en,
      agrupador_id, codigo_wbs, subsector_id
    )
    SELECT
      p_destino_id, a.contrato_id, a.pk_id, a.capitulo, a.item,
      a.fecha_inicio, a.duracion_dias_habiles, a.fecha_fin_calculada,
      a.cantidad_programada, a.unidad, a.costo_unitario,
      a.tipo_distribucion, a.heredado_de_capitulo, a.override_manual,
      a.segmento, p_usuario_id, now(),
      a.agrupador_id, a.codigo_wbs,
      CASE
        WHEN a.subsector_id IS NULL THEN NULL
        ELSE (SELECT m.new_id FROM _prog_sub_map m WHERE m.old_id = a.subsector_id LIMIT 1)
      END
    FROM public.prog_actividades a
    WHERE a.version_id = p_origen_id;
  ELSE
    INSERT INTO public.prog_actividades (
      version_id, contrato_id, pk_id, capitulo, item,
      fecha_inicio, duracion_dias_habiles, fecha_fin_calculada,
      cantidad_programada, unidad, costo_unitario,
      tipo_distribucion, heredado_de_capitulo, override_manual,
      segmento, creado_por, actualizado_en,
      agrupador_id, codigo_wbs
    )
    SELECT
      p_destino_id, a.contrato_id, a.pk_id, a.capitulo, a.item,
      a.fecha_inicio, a.duracion_dias_habiles, a.fecha_fin_calculada,
      a.cantidad_programada, a.unidad, a.costo_unitario,
      a.tipo_distribucion, a.heredado_de_capitulo, a.override_manual,
      a.segmento, p_usuario_id, now(),
      a.agrupador_id, a.codigo_wbs
    FROM public.prog_actividades a
    WHERE a.version_id = p_origen_id;
  END IF;
  GET DIAGNOSTICS v_n_act = ROW_COUNT;

  INSERT INTO public.prog_distribucion_periodos (
    actividad_id, periodo_inicio, periodo_fin, cantidad_periodo, costo_periodo, es_manual
  )
  SELECT
    new_a.id,
    d.periodo_inicio,
    d.periodo_fin,
    d.cantidad_periodo,
    d.costo_periodo,
    d.es_manual
  FROM public.prog_distribucion_periodos d
  INNER JOIN public.prog_actividades old_a
    ON old_a.id = d.actividad_id
   AND old_a.version_id = p_origen_id
  INNER JOIN public.prog_actividades new_a
    ON new_a.version_id = p_destino_id
   AND new_a.pk_id = old_a.pk_id
   AND new_a.capitulo = old_a.capitulo
   AND new_a.item = old_a.item
   AND new_a.segmento = old_a.segmento;
  GET DIAGNOSTICS v_n_dist = ROW_COUNT;

  INSERT INTO public.prog_dependencias (
    version_id, contrato_id,
    pk_id_origen, capitulo_origen, agrupador_id_origen,
    pk_id_destino, capitulo_destino, agrupador_id_destino,
    tipo, lag_dias, creado_por
  )
  SELECT
    p_destino_id, contrato_id,
    pk_id_origen, capitulo_origen, agrupador_id_origen,
    pk_id_destino, capitulo_destino, agrupador_id_destino,
    tipo, lag_dias, p_usuario_id
  FROM public.prog_dependencias
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_dep = ROW_COUNT;

  INSERT INTO public.prog_dependencias_globales (
    version_id, contrato_id, capitulo_origen, capitulo_destino, tipo, lag_dias, creado_por, creado_en
  )
  SELECT
    p_destino_id, contrato_id, capitulo_origen, capitulo_destino, tipo, lag_dias, p_usuario_id, now()
  FROM public.prog_dependencias_globales
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_dep_g = ROW_COUNT;

  INSERT INTO public.prog_cpm_resultados (
    version_id, contrato_id, pk_id, capitulo, agrupador_id,
    fecha_inicio_temprana, fecha_fin_temprana,
    fecha_inicio_tardia, fecha_fin_tardia,
    holgura_total, holgura_libre, es_ruta_critica, calculado_en
  )
  SELECT
    p_destino_id, contrato_id, pk_id, capitulo, agrupador_id,
    fecha_inicio_temprana, fecha_fin_temprana,
    fecha_inicio_tardia, fecha_fin_tardia,
    holgura_total, holgura_libre, es_ruta_critica, calculado_en
  FROM public.prog_cpm_resultados
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_cpm = ROW_COUNT;

  UPDATE public.prog_versiones
  SET cpm_dirty = true,
      cpm_calculado_en = NULL,
      actualizado_en = now()
  WHERE id = p_destino_id;

  RETURN jsonb_build_object(
    'ok', true,
    'origen_id', p_origen_id,
    'destino_id', p_destino_id,
    'capitulos', v_n_cap,
    'actividades', v_n_act,
    'distribuciones', v_n_dist,
    'dependencias', v_n_dep,
    'dependencias_globales', v_n_dep_g,
    'cpm_nodos', v_n_cpm,
    'subsectores', v_n_sub,
    'subsector_lineas', v_n_sub_lin
  );
END;
$function$;
