-- ═══════════════════════════════════════════════════════════════════════════
-- ClaraCore — Versionador de presupuesto
-- Tablas: presupuesto_versiones, presupuesto_version_items
-- RPC: presupuesto_version_crear, presupuesto_version_restaurar
--
-- Ejecutar en Supabase SQL Editor (una vez). Idempotente en lo posible.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) presupuesto_versiones ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.presupuesto_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_version integer NOT NULL,
  etiqueta text NOT NULL,
  es_vigente boolean NOT NULL DEFAULT false,
  justificacion_tecnica text,
  creada_por integer NOT NULL REFERENCES public.usuarios(id),
  creada_en timestamptz NOT NULL DEFAULT now(),
  snapshot_tipo text NOT NULL CHECK (snapshot_tipo IN ('inicial', 'completo')),
  CONSTRAINT uq_presupuesto_version_numero UNIQUE (contrato_id, numero_version),
  CONSTRAINT chk_presupuesto_version_etiqueta CHECK (length(trim(etiqueta)) > 0)
);

COMMENT ON TABLE public.presupuesto_versiones IS
  'Versiones históricas del presupuesto de obra por contrato; una sola vigente a la vez.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuesto_version_vigente
  ON public.presupuesto_versiones (contrato_id)
  WHERE es_vigente = true;

CREATE INDEX IF NOT EXISTS idx_presupuesto_versiones_contrato
  ON public.presupuesto_versiones (contrato_id, numero_version DESC);

-- ── 2) presupuesto_version_items (copia de presupuesto + trazabilidad) ───────

CREATE TABLE IF NOT EXISTS public.presupuesto_version_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES public.presupuesto_versiones(id) ON DELETE CASCADE,
  presupuesto_item_id_origen integer REFERENCES public.presupuesto(id) ON DELETE SET NULL,
  contrato_id integer REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id character varying(100),
  capitulo character varying(200),
  competencia character varying(200),
  item character varying(50),
  descripcion text,
  und character varying(50),
  calzada character varying(100),
  tramo character varying(200),
  abs_inicio character varying(50),
  abs_final character varying(50),
  vlr_unitario numeric(15, 2),
  no_inicio text,
  no_final text,
  area_long_nod numeric(15, 4),
  ancho numeric(15, 4),
  espesor numeric(15, 4),
  cant_total numeric(15, 4),
  costo_directo numeric(15, 2),
  tipo_ejecucion character varying(100),
  tipo_entidad character varying(100),
  id_pol character varying(100),
  observacion text,
  revisado character varying(50),
  observacion_externa text,
  ent_handle character varying(100),
  txt_handle character varying(100),
  layer_ent character varying(100),
  layer_txt character varying(100),
  color_hex character varying(10),
  guid character varying(100),
  x_label numeric(18, 6),
  y_label numeric(18, 6),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  rev_block_handle text,
  dado_de_baja boolean DEFAULT false,
  sellado boolean DEFAULT false,
  validado_por character varying(200),
  validado_en timestamp with time zone,
  pre_interv_estado text,
  pre_interv_por text,
  pre_interv_en timestamp with time zone,
  calculo_por text,
  calculo_en timestamp with time zone
);

COMMENT ON TABLE public.presupuesto_version_items IS
  'Snapshot de filas presupuesto por versión; presupuesto_item_id_origen enlaza con presupuesto.id.';

CREATE INDEX IF NOT EXISTS idx_presupuesto_version_items_version
  ON public.presupuesto_version_items (version_id);

CREATE INDEX IF NOT EXISTS idx_presupuesto_version_items_contrato_version
  ON public.presupuesto_version_items (contrato_id, version_id);

CREATE INDEX IF NOT EXISTS idx_presupuesto_version_items_origen
  ON public.presupuesto_version_items (presupuesto_item_id_origen);

-- ── 3) RPC: crear versión (copia atómica) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.presupuesto_version_crear(
  p_contrato_id integer,
  p_etiqueta text,
  p_justificacion_tecnica text,
  p_creada_por integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_numero integer;
  v_count bigint;
  v_snapshot text;
BEGIN
  IF p_contrato_id IS NULL OR p_creada_por IS NULL THEN
    RAISE EXCEPTION 'presupuesto_version_crear: contrato_id y creada_por son obligatorios'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_etiqueta IS NULL OR length(trim(p_etiqueta)) = 0 THEN
    RAISE EXCEPTION 'presupuesto_version_crear: etiqueta obligatoria'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  SELECT COALESCE(MAX(numero_version), 0) + 1
    INTO v_numero
  FROM public.presupuesto_versiones
  WHERE contrato_id = p_contrato_id;

  v_snapshot := CASE WHEN v_numero = 1 THEN 'inicial' ELSE 'completo' END;
  v_id := gen_random_uuid();

  UPDATE public.presupuesto_versiones
  SET es_vigente = false
  WHERE contrato_id = p_contrato_id
    AND es_vigente = true;

  INSERT INTO public.presupuesto_versiones (
    id,
    contrato_id,
    numero_version,
    etiqueta,
    es_vigente,
    justificacion_tecnica,
    creada_por,
    creada_en,
    snapshot_tipo
  ) VALUES (
    v_id,
    p_contrato_id,
    v_numero,
    trim(p_etiqueta),
    true,
    NULLIF(trim(p_justificacion_tecnica), ''),
    p_creada_por,
    now(),
    v_snapshot
  );

  INSERT INTO public.presupuesto_version_items (
    version_id,
    presupuesto_item_id_origen,
    contrato_id,
    pk_id,
    capitulo,
    competencia,
    item,
    descripcion,
    und,
    calzada,
    tramo,
    abs_inicio,
    abs_final,
    vlr_unitario,
    no_inicio,
    no_final,
    area_long_nod,
    ancho,
    espesor,
    cant_total,
    costo_directo,
    tipo_ejecucion,
    tipo_entidad,
    id_pol,
    observacion,
    revisado,
    observacion_externa,
    ent_handle,
    txt_handle,
    layer_ent,
    layer_txt,
    color_hex,
    guid,
    x_label,
    y_label,
    created_at,
    updated_at,
    rev_block_handle,
    dado_de_baja,
    sellado,
    validado_por,
    validado_en,
    pre_interv_estado,
    pre_interv_por,
    pre_interv_en,
    calculo_por,
    calculo_en
  )
  SELECT
    v_id,
    p.id,
    p.contrato_id,
    p.pk_id,
    p.capitulo,
    p.competencia,
    p.item,
    p.descripcion,
    p.und,
    p.calzada,
    p.tramo,
    p.abs_inicio,
    p.abs_final,
    p.vlr_unitario,
    p.no_inicio,
    p.no_final,
    p.area_long_nod,
    p.ancho,
    p.espesor,
    p.cant_total,
    p.costo_directo,
    p.tipo_ejecucion,
    p.tipo_entidad,
    p.id_pol,
    p.observacion,
    p.revisado,
    p.observacion_externa,
    p.ent_handle,
    p.txt_handle,
    p.layer_ent,
    p.layer_txt,
    p.color_hex,
    p.guid,
    p.x_label,
    p.y_label,
    p.created_at,
    p.updated_at,
    p.rev_block_handle,
    p.dado_de_baja,
    p.sellado,
    p.validado_por,
    p.validado_en,
    p.pre_interv_estado,
    p.pre_interv_por,
    p.pre_interv_en,
    p.calculo_por,
    p.calculo_en
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND p.tipo_ejecucion = 'Presupuesto de Obra'
    AND COALESCE(p.dado_de_baja, false) = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'version_id', v_id,
    'numero_version', v_numero,
    'snapshot_tipo', v_snapshot,
    'items_copiados', v_count
  );
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_crear(integer, text, text, integer) IS
  'Crea versión de presupuesto, marca vigente y copia filas Presupuesto de Obra activas.';

-- ── 4) RPC: restaurar versión vigente ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.presupuesto_version_restaurar(
  p_contrato_id integer,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.presupuesto_versiones v
    WHERE v.id = p_version_id
      AND v.contrato_id = p_contrato_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'presupuesto_version_restaurar: versión no encontrada para el contrato'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  UPDATE public.presupuesto_versiones
  SET es_vigente = false
  WHERE contrato_id = p_contrato_id
    AND es_vigente = true;

  UPDATE public.presupuesto_versiones
  SET es_vigente = true
  WHERE id = p_version_id
    AND contrato_id = p_contrato_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id);
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_restaurar(integer, uuid) IS
  'Marca una versión histórica como vigente (solo metadato; no modifica presupuesto vivo).';

-- ── 5) RLS (defensa en profundidad; API usa service role) ─────────────────────

ALTER TABLE public.presupuesto_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuesto_version_items ENABLE ROW LEVEL SECURITY;
