-- WBS — Agrupadores de Listado de Precios
-- Aprobado: ON DELETE RESTRICT + codigo_wbs opcional

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla de agrupadores
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS listado_precios_agrupadores (
  id              BIGSERIAL PRIMARY KEY,
  contrato_id     INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  capitulo        VARCHAR(255) NOT NULL,
  codigo_wbs      VARCHAR(50),
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  orden           INTEGER NOT NULL DEFAULT 0,
  creado_por      BIGINT REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT listado_precios_agrupadores_nombre_no_vacio
    CHECK (length(trim(nombre)) > 0),

  CONSTRAINT listado_precios_agrupadores_unique_nombre
    UNIQUE (contrato_id, capitulo, nombre)
);

COMMENT ON TABLE listado_precios_agrupadores IS
  'WBS del listado de precios: actividad padre por contrato y capítulo. Sin precio propio.';

COMMENT ON COLUMN listado_precios_agrupadores.codigo_wbs IS
  'Código WBS opcional, ej. 2.A, 2.B';

COMMENT ON COLUMN listado_precios_agrupadores.orden IS
  'Orden de visualización dentro del capítulo (menor = primero).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_lp_agrup_codigo_wbs_unique
  ON listado_precios_agrupadores (contrato_id, capitulo, codigo_wbs)
  WHERE codigo_wbs IS NOT NULL AND length(trim(codigo_wbs)) > 0;

CREATE INDEX IF NOT EXISTS idx_lp_agrup_contrato_cap
  ON listado_precios_agrupadores (contrato_id, capitulo);

CREATE INDEX IF NOT EXISTS idx_lp_agrup_contrato
  ON listado_precios_agrupadores (contrato_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FK opcional en listado_precios (RESTRICT: no borrar agrupador con hijos)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE listado_precios
  ADD COLUMN IF NOT EXISTS agrupador_id BIGINT
    REFERENCES listado_precios_agrupadores(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_listado_precios_agrupador_id
  ON listado_precios (agrupador_id)
  WHERE agrupador_id IS NOT NULL;

COMMENT ON COLUMN listado_precios.agrupador_id IS
  'Agrupador WBS opcional. Debe pertenecer al mismo contrato y capítulo del ítem.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Integridad: agrupador coherente con contrato + capítulo del ítem
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_listado_precios_agrupador_coherente()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ag RECORD;
BEGIN
  IF NEW.agrupador_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT contrato_id, capitulo
  INTO ag
  FROM listado_precios_agrupadores
  WHERE id = NEW.agrupador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agrupador % no existe', NEW.agrupador_id;
  END IF;

  IF ag.contrato_id IS DISTINCT FROM NEW.contrato_id THEN
    RAISE EXCEPTION 'El agrupador pertenece a otro contrato';
  END IF;

  IF trim(coalesce(ag.capitulo, '')) IS DISTINCT FROM trim(coalesce(NEW.capitulo, '')) THEN
    RAISE EXCEPTION 'El agrupador no pertenece al capítulo del ítem';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listado_precios_agrupador_coherente ON listado_precios;

CREATE TRIGGER listado_precios_agrupador_coherente
  BEFORE INSERT OR UPDATE OF agrupador_id, contrato_id, capitulo
  ON listado_precios
  FOR EACH ROW
  EXECUTE FUNCTION trg_listado_precios_agrupador_coherente();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vista de resumen (precio agrupador = suma de hijos, nunca almacenado)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_listado_precios_agrupador_resumen
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.contrato_id,
  a.capitulo,
  a.codigo_wbs,
  a.nombre,
  a.descripcion,
  a.orden,
  COUNT(lp.id) AS items_total,
  COALESCE(SUM(lp.precio_unitario), 0) AS precio_unitario_suma_hijos
FROM listado_precios_agrupadores a
LEFT JOIN listado_precios lp ON lp.agrupador_id = a.id
GROUP BY a.id, a.contrato_id, a.capitulo, a.codigo_wbs, a.nombre, a.descripcion, a.orden;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS (tabla agrupadores + vista resumen)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.usuario_puede_ver_contrato(p_contrato_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid bigint;
  v_claims json;
  v_raw text;
BEGIN
  IF p_contrato_id IS NULL THEN
    RETURN false;
  END IF;
  v_raw := NULLIF(current_setting('request.jwt.claims', true), '');
  IF v_raw IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_claims := v_raw::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  BEGIN
    v_uid := NULLIF(trim(v_claims->>'sub'), '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid
      AND (
        u.contrato_id = p_contrato_id
        OR EXISTS (
          SELECT 1 FROM public.usuario_contratos uc
          WHERE uc.usuario_id = u.id AND uc.contrato_id = p_contrato_id
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.usuario_puede_ver_contrato(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_puede_ver_contrato(integer) TO authenticated, service_role;

ALTER TABLE listado_precios_agrupadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lp_agrup_select ON listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_insert ON listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_update ON listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_delete ON listado_precios_agrupadores;

CREATE POLICY lp_agrup_select ON listado_precios_agrupadores
  FOR SELECT USING (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_insert ON listado_precios_agrupadores
  FOR INSERT WITH CHECK (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_update ON listado_precios_agrupadores
  FOR UPDATE USING (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_delete ON listado_precios_agrupadores
  FOR DELETE USING (public.usuario_puede_ver_contrato(contrato_id));

ALTER VIEW v_listado_precios_agrupador_resumen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v_lp_agrup_resumen_select ON v_listado_precios_agrupador_resumen;

CREATE POLICY v_lp_agrup_resumen_select ON v_listado_precios_agrupador_resumen
  FOR SELECT USING (public.usuario_puede_ver_contrato(contrato_id));

REVOKE ALL ON v_listado_precios_agrupador_resumen FROM PUBLIC;
REVOKE ALL ON v_listado_precios_agrupador_resumen FROM anon, authenticated;
GRANT SELECT ON v_listado_precios_agrupador_resumen TO service_role;
