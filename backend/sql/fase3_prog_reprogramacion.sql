-- ═══════════════════════════════════════════════════════════════════════════
-- ClaraCore — Programación de Obra Fase 3A: Reprogramación (fundamentos)
-- REVISAR COMPLETO antes de ejecutar en Supabase SQL Editor.
--
-- Incluye:
--   1. Campos en contratos (baseline, umbrales desviación)
--   2. Campos en prog_versiones (origen, superseded, metadata)
--   3. Tabla prog_presupuesto_snapshot
--   4. Trigger sellada → permite archivado controlado
--   5. RPC prog_snapshot_presupuesto
--   6. RPC prog_clone_version
--   7. Backfill prog_version_baseline_id
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) contratos ───────────────────────────────────────────────────────────

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS prog_version_baseline_id uuid
    REFERENCES public.prog_versiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prog_umbral_desviacion_fechas_pct numeric(5,2)
    NOT NULL DEFAULT 10
    CHECK (prog_umbral_desviacion_fechas_pct >= 0 AND prog_umbral_desviacion_fechas_pct <= 100),
  ADD COLUMN IF NOT EXISTS prog_umbral_desviacion_costo_pct numeric(5,2)
    NOT NULL DEFAULT 10
    CHECK (prog_umbral_desviacion_costo_pct >= 0 AND prog_umbral_desviacion_costo_pct <= 100);

COMMENT ON COLUMN public.contratos.prog_version_baseline_id IS
  'Versión baseline sellada de referencia para comparación y desviación. Fijada al sellar la primera baseline.';
COMMENT ON COLUMN public.contratos.prog_umbral_desviacion_fechas_pct IS
  'Umbral % desviación fechas vs baseline para alertas (Fase 3). Default 10.';
COMMENT ON COLUMN public.contratos.prog_umbral_desviacion_costo_pct IS
  'Umbral % desviación costo vs baseline para alertas (Fase 3). Default 10.';

-- ── 2) prog_versiones ────────────────────────────────────────────────────────

ALTER TABLE public.prog_versiones
  ADD COLUMN IF NOT EXISTS version_origen_id uuid
    REFERENCES public.prog_versiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid
    REFERENCES public.prog_versiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cpm_dirty boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cpm_calculado_en timestamptz;

COMMENT ON COLUMN public.prog_versiones.version_origen_id IS
  'Versión clonada al crear reprogramación/suspensión (normalmente la vigente anterior).';
COMMENT ON COLUMN public.prog_versiones.superseded_by_id IS
  'Versión que reemplazó a esta al sellarse (solo cuando pasa a archivada).';
COMMENT ON COLUMN public.prog_versiones.metadata IS
  'Metadatos de la versión (p.ej. fechas de suspensión contractual).';

CREATE INDEX IF NOT EXISTS idx_prog_versiones_origen
  ON public.prog_versiones (version_origen_id)
  WHERE version_origen_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prog_versiones_superseded
  ON public.prog_versiones (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- ── 3) prog_presupuesto_snapshot ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prog_presupuesto_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  item varchar(100) NOT NULL,
  agrupador_id bigint REFERENCES public.listado_precios_agrupadores(id) ON DELETE SET NULL,
  cantidad numeric(12,4) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,2) NOT NULL CHECK (costo_unitario >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_ppto_snap_item UNIQUE (version_id, pk_id, capitulo, item)
);

CREATE INDEX IF NOT EXISTS idx_prog_ppto_snap_version
  ON public.prog_presupuesto_snapshot (version_id);

CREATE INDEX IF NOT EXISTS idx_prog_ppto_snap_contrato
  ON public.prog_presupuesto_snapshot (contrato_id, version_id);

COMMENT ON TABLE public.prog_presupuesto_snapshot IS
  'Snapshot del presupuesto poligonal al sellar cada versión; base para detectar deltas por otrosí.';

-- ── 4) Trigger: versión sellada — permitir archivado controlado ─────────────

CREATE OR REPLACE FUNCTION public.prog_trg_block_update_if_version_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = 'sellada' THEN
    -- Transición sellada → archivada: solo estado, superseded_by_id, actualizado_en
    IF NEW.estado = 'archivada'
       AND NEW.id = OLD.id
       AND NEW.contrato_id = OLD.contrato_id
       AND NEW.numero_version = OLD.numero_version
       AND NEW.tipo = OLD.tipo
       AND NEW.motivo_reprogramacion IS NOT DISTINCT FROM OLD.motivo_reprogramacion
       AND NEW.creado_por = OLD.creado_por
       AND NEW.sellado_por IS NOT DISTINCT FROM OLD.sellado_por
       AND NEW.sellado_en IS NOT DISTINCT FROM OLD.sellado_en
       AND NEW.creado_en = OLD.creado_en
       AND NEW.version_origen_id IS NOT DISTINCT FROM OLD.version_origen_id
       AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
       AND NEW.cpm_dirty IS NOT DISTINCT FROM OLD.cpm_dirty
       AND NEW.cpm_calculado_en IS NOT DISTINCT FROM OLD.cpm_calculado_en
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'prog_versiones: versión sellada es inmutable (UPDATE bloqueado)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5) RPC: snapshot presupuesto al sellar ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.prog_snapshot_presupuesto(
  p_version_id uuid,
  p_contrato_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.prog_versiones v
    WHERE v.id = p_version_id
      AND v.contrato_id = p_contrato_id
      AND v.estado = 'sellada'
  ) THEN
    RAISE EXCEPTION 'prog_snapshot_presupuesto: version % no sellada o contrato invalido', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.prog_presupuesto_snapshot
  WHERE version_id = p_version_id;

  INSERT INTO public.prog_presupuesto_snapshot (
    version_id,
    contrato_id,
    pk_id,
    capitulo,
    item,
    agrupador_id,
    cantidad,
    costo_unitario
  )
  SELECT
    p_version_id,
    p_contrato_id,
    agg.pk_id,
    agg.capitulo,
    agg.item,
    lp.agrupador_id,
    agg.cantidad,
    agg.costo_unitario
  FROM (
    SELECT
      trim(p.pk_id::text) AS pk_id,
      trim(p.capitulo::text) AS capitulo,
      trim(p.item::text) AS item,
      sum(p.cant_total)::numeric(12,4) AS cantidad,
      max(p.vlr_unitario)::numeric(14,2) AS costo_unitario
    FROM public.presupuesto p
    WHERE p.contrato_id = p_contrato_id
      AND trim(coalesce(p.tipo_ejecucion::text, '')) = 'Presupuesto de Obra'
      AND coalesce(p.dado_de_baja, false) = false
      AND trim(coalesce(p.pk_id::text, '')) <> ''
      AND trim(coalesce(p.capitulo::text, '')) <> ''
      AND trim(coalesce(p.item::text, '')) <> ''
    GROUP BY 1, 2, 3
    HAVING sum(p.cant_total) > 0
  ) agg
  LEFT JOIN public.listado_precios lp
    ON lp.contrato_id = p_contrato_id
   AND trim(lp.capitulo::text) = agg.capitulo
   AND trim(lp.item_numero::text) = agg.item;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'version_id', p_version_id,
    'items', v_count
  );
END;
$function$;

COMMENT ON FUNCTION public.prog_snapshot_presupuesto(uuid, bigint) IS
  'Genera snapshot del presupuesto poligonal al sellar una versión (idempotente por version_id).';

-- ── 6) RPC: clonar datos de versión sellada/archivada → borrador ─────────────

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

  -- Limpiar hijos del destino (pk_estado skeleton OK; se recalcula desde Python)
  DELETE FROM public.prog_cpm_resultados WHERE version_id = p_destino_id;
  DELETE FROM public.prog_dependencias WHERE version_id = p_destino_id;
  DELETE FROM public.prog_dependencias_globales WHERE version_id = p_destino_id;
  DELETE FROM public.prog_actividades_capitulo WHERE version_id = p_destino_id;

  -- 1) Capítulos
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

  -- 2) Actividades
  INSERT INTO public.prog_actividades (
    version_id, contrato_id, pk_id, capitulo, item,
    fecha_inicio, duracion_dias_habiles, fecha_fin_calculada,
    cantidad_programada, unidad, costo_unitario,
    tipo_distribucion, heredado_de_capitulo, override_manual,
    segmento, creado_por, actualizado_en,
    agrupador_id, codigo_wbs
  )
  SELECT
    p_destino_id, contrato_id, pk_id, capitulo, item,
    fecha_inicio, duracion_dias_habiles, fecha_fin_calculada,
    cantidad_programada, unidad, costo_unitario,
    tipo_distribucion, heredado_de_capitulo, override_manual,
    segmento, p_usuario_id, now(),
    agrupador_id, codigo_wbs
  FROM public.prog_actividades
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_act = ROW_COUNT;

  -- 3) Distribución por periodos (mapeo por clave natural ítem)
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

  -- 4) Dependencias específicas
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

  -- 5) Dependencias globales
  INSERT INTO public.prog_dependencias_globales (
    version_id, contrato_id, capitulo_origen, capitulo_destino, tipo, lag_dias, creado_por, creado_en
  )
  SELECT
    p_destino_id, contrato_id, capitulo_origen, capitulo_destino, tipo, lag_dias, p_usuario_id, now()
  FROM public.prog_dependencias_globales
  WHERE version_id = p_origen_id;
  GET DIAGNOSTICS v_n_dep_g = ROW_COUNT;

  -- 6) Resultados CPM (copia; el destino queda marcado dirty en prog_versiones)
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
    'cpm_nodos', v_n_cpm
  );
END;
$function$;

COMMENT ON FUNCTION public.prog_clone_version(uuid, uuid, bigint, bigint) IS
  'Clona cronograma completo (actividades, deps, CPM) de versión sellada/archivada a borrador.';

-- ── 7) Backfill baseline_id en contratos existentes ──────────────────────────

UPDATE public.contratos c
SET prog_version_baseline_id = sub.id
FROM (
  SELECT DISTINCT ON (v.contrato_id)
    v.contrato_id,
    v.id
  FROM public.prog_versiones v
  WHERE v.tipo = 'baseline'
    AND v.estado = 'sellada'
  ORDER BY v.contrato_id, v.sellado_en DESC NULLS LAST, v.numero_version DESC
) sub
WHERE c.id = sub.contrato_id
  AND c.prog_version_baseline_id IS NULL;

COMMIT;
