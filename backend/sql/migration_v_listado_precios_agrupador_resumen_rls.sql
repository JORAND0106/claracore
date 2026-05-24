-- Seguridad: v_listado_precios_agrupador_resumen
-- - RLS + política por contrato (usuario_contratos o contrato principal)
-- - Sin acceso directo vía PostgREST (anon/authenticated)
-- - El backend FastAPI usa service_role y agrega en Python (no depende de SELECT a la vista)

-- ── Helper: ¿el JWT actual puede ver este contrato? ───────────────────────────
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
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_uid
      AND (
        u.contrato_id = p_contrato_id
        OR EXISTS (
          SELECT 1
          FROM public.usuario_contratos uc
          WHERE uc.usuario_id = u.id
            AND uc.contrato_id = p_contrato_id
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.usuario_puede_ver_contrato(integer) IS
  'RLS: true si auth JWT (claim sub = usuarios.id) tiene contrato principal o fila en usuario_contratos.';

REVOKE ALL ON FUNCTION public.usuario_puede_ver_contrato(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_puede_ver_contrato(integer) TO authenticated, service_role;

-- ── Vista con security_invoker (PG15+) para que RLS aplique al invocador ───
CREATE OR REPLACE VIEW public.v_listado_precios_agrupador_resumen
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
FROM public.listado_precios_agrupadores a
LEFT JOIN public.listado_precios lp ON lp.agrupador_id = a.id
GROUP BY a.id, a.contrato_id, a.capitulo, a.codigo_wbs, a.nombre, a.descripcion, a.orden;

-- RLS en la vista (PostgreSQL 15+)
ALTER VIEW public.v_listado_precios_agrupador_resumen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v_lp_agrup_resumen_select ON public.v_listado_precios_agrupador_resumen;

CREATE POLICY v_lp_agrup_resumen_select ON public.v_listado_precios_agrupador_resumen
  FOR SELECT
  USING (public.usuario_puede_ver_contrato(contrato_id));

-- Bloquear lectura directa desde cliente Supabase (anon/authenticated)
REVOKE ALL ON public.v_listado_precios_agrupador_resumen FROM PUBLIC;
REVOKE ALL ON public.v_listado_precios_agrupador_resumen FROM anon, authenticated;

GRANT SELECT ON public.v_listado_precios_agrupador_resumen TO service_role;

COMMENT ON VIEW public.v_listado_precios_agrupador_resumen IS
  'Resumen WBS por agrupador. RLS activo; acceso de aplicación vía FastAPI (service_role + _require_contract_access).';

-- ── Tabla base: reemplazar políticas permissivas (USING true) ────────────────
ALTER TABLE public.listado_precios_agrupadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lp_agrup_select ON public.listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_insert ON public.listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_update ON public.listado_precios_agrupadores;
DROP POLICY IF EXISTS lp_agrup_delete ON public.listado_precios_agrupadores;

CREATE POLICY lp_agrup_select ON public.listado_precios_agrupadores
  FOR SELECT USING (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_insert ON public.listado_precios_agrupadores
  FOR INSERT WITH CHECK (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_update ON public.listado_precios_agrupadores
  FOR UPDATE USING (public.usuario_puede_ver_contrato(contrato_id));

CREATE POLICY lp_agrup_delete ON public.listado_precios_agrupadores
  FOR DELETE USING (public.usuario_puede_ver_contrato(contrato_id));
