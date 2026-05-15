-- ═══════════════════════════════════════════════════════════════════════════
-- ClaraCore — Programación de obra (Fase 1)
-- Ejecutar en Supabase SQL Editor (una vez). Idempotente en lo posible (IF NOT EXISTS).
-- Orden: tablas → FK contratos.prog_version_vigente_id → índices → triggers → RPC mapa
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) prog_versiones (antes de ALTER contratos: la FK vigente apunta aquí) ──
CREATE TABLE IF NOT EXISTS public.prog_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_version integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('baseline', 'reprogramacion', 'suspension')),
  estado text NOT NULL CHECK (estado IN ('borrador', 'en_validacion', 'sellada', 'rechazada', 'archivada')),
  motivo_reprogramacion text,
  creado_por bigint NOT NULL REFERENCES public.usuarios(id),
  sellado_por bigint REFERENCES public.usuarios(id),
  sellado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_version_numero UNIQUE (contrato_id, numero_version),
  CONSTRAINT chk_prog_version_motivo CHECK (
    tipo = 'baseline'
    OR (motivo_reprogramacion IS NOT NULL AND length(trim(motivo_reprogramacion)) > 0)
  )
);

COMMENT ON TABLE public.prog_versiones IS 'Cronograma por contrato: versiones baseline / reprogramación / suspensión.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_prog_una_baseline_activa
  ON public.prog_versiones (contrato_id)
  WHERE tipo = 'baseline' AND estado NOT IN ('archivada', 'rechazada');

CREATE INDEX IF NOT EXISTS idx_prog_versiones_contrato_estado
  ON public.prog_versiones (contrato_id, estado);

-- ── 2) contratos.prog_version_vigente_id (actualizada solo desde FastAPI al sellar) ──
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS prog_version_vigente_id uuid REFERENCES public.prog_versiones(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contratos.prog_version_vigente_id IS
  'Versión sellada vigente del cronograma. NULL = sin cronograma sellado. Mantenida solo por la API.';

-- ── 3) prog_validaciones (niveles >= 2; configuración en contrato_niveles_validacion) ──
CREATE TABLE IF NOT EXISTS public.prog_validaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  orden smallint NOT NULL DEFAULT 0,
  nivel integer NOT NULL CHECK (nivel >= 2 AND nivel <= 12),
  estado text NOT NULL CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  observacion text,
  validado_por bigint REFERENCES public.usuarios(id),
  validado_en timestamptz,
  CONSTRAINT chk_prog_val_obs CHECK (
    estado <> 'rechazado'
    OR (observacion IS NOT NULL AND length(trim(observacion)) > 0)
  ),
  CONSTRAINT uq_prog_validacion_version_nivel UNIQUE (version_id, nivel)
);

CREATE INDEX IF NOT EXISTS idx_prog_validaciones_version ON public.prog_validaciones (version_id, orden);

-- ── 4) prog_pk_estado (fuente única del endpoint /mapa) ──
CREATE TABLE IF NOT EXISTS public.prog_pk_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  estado_programacion text NOT NULL
    CHECK (estado_programacion IN ('sin_iniciar', 'en_progreso', 'completa', 'sin_cantidad')),
  items_total integer NOT NULL DEFAULT 0 CHECK (items_total >= 0),
  items_con_fecha integer NOT NULL DEFAULT 0 CHECK (items_con_fecha >= 0),
  porcentaje_programado numeric(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN items_total IS NULL OR items_total = 0 THEN NULL
      ELSE round((100.0 * (items_con_fecha::numeric) / NULLIF(items_total, 0)::numeric)::numeric, 2)
    END
  ) STORED,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_pk_estado_version_pk UNIQUE (version_id, pk_id)
);

CREATE INDEX IF NOT EXISTS idx_prog_pk_estado_version_contrato
  ON public.prog_pk_estado (version_id, contrato_id);

CREATE INDEX IF NOT EXISTS idx_prog_pk_estado_contrato_pk ON public.prog_pk_estado (contrato_id, pk_id);

-- ── 5) Capítulo (herencia) ──
CREATE TABLE IF NOT EXISTS public.prog_actividades_capitulo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  fecha_inicio_sugerida date,
  duracion_dias_habiles integer CHECK (duracion_dias_habiles IS NULL OR duracion_dias_habiles > 0),
  aplica_herencia boolean NOT NULL DEFAULT false,
  creado_por bigint NOT NULL REFERENCES public.usuarios(id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_act_cap UNIQUE (version_id, pk_id, capitulo)
);

CREATE INDEX IF NOT EXISTS idx_prog_act_cap_lookup ON public.prog_actividades_capitulo (version_id, contrato_id, pk_id);

-- ── 6) Ítem / segmento ──
CREATE TABLE IF NOT EXISTS public.prog_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  item varchar(100) NOT NULL,
  fecha_inicio date,
  duracion_dias_habiles integer CHECK (duracion_dias_habiles IS NULL OR duracion_dias_habiles > 0),
  fecha_fin_calculada date,
  cantidad_programada numeric(12,4) NOT NULL CHECK (cantidad_programada > 0),
  unidad varchar(20) NOT NULL,
  costo_unitario numeric(14,2) NOT NULL,
  tipo_distribucion text NOT NULL CHECK (tipo_distribucion IN ('lineal', 'manual')),
  heredado_de_capitulo boolean NOT NULL DEFAULT false,
  override_manual boolean NOT NULL DEFAULT false,
  segmento integer NOT NULL DEFAULT 1 CHECK (segmento >= 1),
  creado_por bigint NOT NULL REFERENCES public.usuarios(id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_act_item_seg UNIQUE (version_id, pk_id, capitulo, item, segmento)
);

CREATE INDEX IF NOT EXISTS idx_prog_act_version_pk ON public.prog_actividades (version_id, contrato_id, pk_id);

-- ── 7) Distribución por periodos ──
CREATE TABLE IF NOT EXISTS public.prog_distribucion_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id uuid NOT NULL REFERENCES public.prog_actividades(id) ON DELETE CASCADE,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  cantidad_periodo numeric(12,4) NOT NULL,
  costo_periodo numeric(16,2) NOT NULL,
  es_manual boolean NOT NULL DEFAULT false,
  CONSTRAINT chk_prog_dist_periodo CHECK (periodo_fin >= periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_prog_dist_actividad ON public.prog_distribucion_periodos (actividad_id);

-- ── 8) Calendario no hábil (NULL contrato_id = todos los contratos) ──
CREATE TABLE IF NOT EXISTS public.prog_calendario_no_habiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id bigint REFERENCES public.contratos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (
    tipo IN ('festivo_nacional', 'festivo_regional', 'suspension_contractual', 'otro')
  ),
  descripcion varchar(200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prog_cal_global_fecha
  ON public.prog_calendario_no_habiles (fecha)
  WHERE contrato_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prog_cal_contrato_fecha
  ON public.prog_calendario_no_habiles (contrato_id, fecha)
  WHERE contrato_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prog_cal_contrato_fecha_lookup
  ON public.prog_calendario_no_habiles (contrato_id, fecha);

-- ═══════════════════════════════════════════════════════════════════════════
-- Integridad: versión sellada — bloquear mutación (sin lógica de negocio)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prog_trg_block_update_if_version_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = 'sellada' THEN
    RAISE EXCEPTION 'prog_versiones: versión sellada es inmutable (UPDATE bloqueado)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prog_versiones_block_upd_sealed ON public.prog_versiones;
CREATE TRIGGER tr_prog_versiones_block_upd_sealed
  BEFORE UPDATE ON public.prog_versiones
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_block_update_if_version_sealed();

CREATE OR REPLACE FUNCTION public.prog_trg_block_delete_if_version_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = 'sellada' THEN
    RAISE EXCEPTION 'prog_versiones: versión sellada no se elimina'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_prog_versiones_block_del_sealed ON public.prog_versiones;
CREATE TRIGGER tr_prog_versiones_block_del_sealed
  BEFORE DELETE ON public.prog_versiones
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_block_delete_if_version_sealed();

-- Hijo con version_id directo
CREATE OR REPLACE FUNCTION public.prog_trg_child_mut_block_if_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  vid uuid;
  st text;
  vid_old uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    vid := NEW.version_id;
  ELSIF TG_OP = 'UPDATE' THEN
    vid := NEW.version_id;
    vid_old := OLD.version_id;
    SELECT estado INTO st FROM public.prog_versiones WHERE id = vid_old;
    IF st = 'sellada' AND (vid IS DISTINCT FROM vid_old) THEN
      RAISE EXCEPTION '%: no mover fila desde versión sellada', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    vid := OLD.version_id;
  END IF;

  SELECT estado INTO st FROM public.prog_versiones WHERE id = vid;
  IF st = 'sellada' THEN
    RAISE EXCEPTION '%: operación % no permitida (versión sellada)', TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_prog_validaciones_sealed ON public.prog_validaciones;
CREATE TRIGGER tr_prog_validaciones_sealed
  BEFORE INSERT OR UPDATE OR DELETE ON public.prog_validaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_child_mut_block_if_sealed();

DROP TRIGGER IF EXISTS tr_prog_pk_estado_sealed ON public.prog_pk_estado;
CREATE TRIGGER tr_prog_pk_estado_sealed
  BEFORE INSERT OR UPDATE OR DELETE ON public.prog_pk_estado
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_child_mut_block_if_sealed();

DROP TRIGGER IF EXISTS tr_prog_act_cap_sealed ON public.prog_actividades_capitulo;
CREATE TRIGGER tr_prog_act_cap_sealed
  BEFORE INSERT OR UPDATE OR DELETE ON public.prog_actividades_capitulo
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_child_mut_block_if_sealed();

DROP TRIGGER IF EXISTS tr_prog_act_sealed ON public.prog_actividades;
CREATE TRIGGER tr_prog_act_sealed
  BEFORE INSERT OR UPDATE OR DELETE ON public.prog_actividades
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_child_mut_block_if_sealed();

-- Distribución: resuelve versión vía actividad
CREATE OR REPLACE FUNCTION public.prog_trg_distrib_mut_block_if_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  vid uuid;
  st text;
  aid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    aid := OLD.actividad_id;
  ELSE
    aid := NEW.actividad_id;
  END IF;
  SELECT a.version_id INTO vid
  FROM public.prog_actividades a
  WHERE a.id = aid;
  IF vid IS NULL THEN
    RAISE EXCEPTION 'prog_distribucion_periodos: actividad inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT estado INTO st FROM public.prog_versiones WHERE id = vid;
  IF st = 'sellada' THEN
    RAISE EXCEPTION 'prog_distribucion_periodos: versión sellada' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_prog_dist_sealed ON public.prog_distribucion_periodos;
CREATE TRIGGER tr_prog_dist_sealed
  BEFORE INSERT OR UPDATE OR DELETE ON public.prog_distribucion_periodos
  FOR EACH ROW
  EXECUTE PROCEDURE public.prog_trg_distrib_mut_block_if_sealed();

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: estados de PK para mapa — una sola consulta (rendimiento)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prog_mapa_pk_estados(p_contrato_id bigint)
RETURNS TABLE (
  pk_id varchar,
  estado_programacion text,
  items_total integer,
  items_con_fecha integer,
  porcentaje_programado numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH pks AS (
    SELECT DISTINCT trim(pki.pk_id::text) AS pk_id
    FROM public.pk_ids pki
    WHERE pki.contrato_id = p_contrato_id
      AND trim(pki.pk_id::text) <> ''
  ),
  estado_v AS (
    SELECT trim(e.pk_id::text) AS pk_id,
           e.estado_programacion::text AS estado_programacion,
           e.items_total::integer AS items_total,
           e.items_con_fecha::integer AS items_con_fecha,
           e.porcentaje_programado::numeric AS porcentaje_programado
    FROM public.prog_pk_estado e
    INNER JOIN public.contratos c
      ON c.id = p_contrato_id
     AND c.id = e.contrato_id
     AND c.prog_version_vigente_id IS NOT NULL
     AND e.version_id = c.prog_version_vigente_id
  ),
  ppto_items AS (
    SELECT d.pk_id, count(*)::integer AS n_items
    FROM (
      SELECT DISTINCT
        trim(p.pk_id::text) AS pk_id,
        trim(p.capitulo::text) AS capitulo,
        trim(p.item::text) AS item
      FROM public.presupuesto p
      WHERE p.contrato_id = p_contrato_id
        AND trim(coalesce(p.tipo_ejecucion::text, '')) = 'Presupuesto de Obra'
        AND coalesce(p.dado_de_baja, false) = false
        AND trim(coalesce(p.pk_id::text, '')) <> ''
        AND trim(coalesce(p.capitulo::text, '')) <> ''
        AND trim(coalesce(p.item::text, '')) <> ''
    ) d
    GROUP BY d.pk_id
  )
  SELECT
    p.pk_id::varchar,
    coalesce(
      ev.estado_programacion,
      CASE WHEN coalesce(pi.n_items, 0) > 0 THEN 'sin_iniciar' ELSE 'sin_cantidad' END
    )::text AS estado_programacion,
    coalesce(ev.items_total, coalesce(pi.n_items, 0))::integer AS items_total,
    coalesce(ev.items_con_fecha, 0)::integer AS items_con_fecha,
    CASE
      WHEN ev.estado_programacion IS NOT NULL THEN ev.porcentaje_programado
      WHEN coalesce(pi.n_items, 0) = 0 THEN NULL::numeric
      ELSE 0::numeric
    END AS porcentaje_programado
  FROM pks p
  LEFT JOIN estado_v ev ON ev.pk_id = p.pk_id
  LEFT JOIN ppto_items pi ON pi.pk_id = p.pk_id;
$$;

COMMENT ON FUNCTION public.prog_mapa_pk_estados(bigint) IS
  'Mapa: por PK del contrato (pk_ids), estado desde prog_pk_estado de la versión vigente sellada; si no hay fila, sin_iniciar/sin_cantidad según presupuesto «Presupuesto de Obra» activo.';

-- Si la tabla ya existía sin columna `orden` (migración incremental):
ALTER TABLE public.prog_validaciones
  ADD COLUMN IF NOT EXISTS orden smallint NOT NULL DEFAULT 0;
