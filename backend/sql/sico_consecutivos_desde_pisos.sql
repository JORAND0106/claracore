-- ═══════════════════════════════════════════════════════════════════════════
-- SICO (Supabase): consecutivos alineados con MAX real + piso, sin 23505.
--  • numero_registro (so_registros)  → piso 55000
--  • numero_reporte  (so_reportes)   → piso 35000
-- Ejecuta TODO en SQL Editor. Requiere tablas: so_registros, so_reportes, contratos
--   (o ajusta el INSERT de contratos al final).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sico_ultimo_numero_registro (
  contrato_id     integer NOT NULL PRIMARY KEY,
  reservado_hasta integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sico_ultimo_numero_reporte (
  contrato_id     integer NOT NULL PRIMARY KEY,
  reservado_hasta integer NOT NULL
);

-- Inicial: último usado = MAX en tabla (piso-1 si no hay filas, para que el 1.º sea 55000/35000)
INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
SELECT
  s.contrato_id,
  GREATEST(54999, COALESCE(MAX(s.numero_registro), 0))
FROM public.so_registros s
GROUP BY s.contrato_id
ON CONFLICT (contrato_id) DO UPDATE
SET reservado_hasta = GREATEST(
  public.sico_ultimo_numero_registro.reservado_hasta,
  EXCLUDED.reservado_hasta
);

INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
SELECT
  r.contrato_id,
  GREATEST(34999, COALESCE(MAX(r.numero_reporte), 0))
FROM public.so_reportes r
GROUP BY r.contrato_id
ON CONFLICT (contrato_id) DO UPDATE
SET reservado_hasta = GREATEST(
  public.sico_ultimo_numero_reporte.reservado_hasta,
  EXCLUDED.reservado_hasta
);

-- Contratos sin aún registro: que puedan reservar desde el piso
INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
SELECT c.id, 54999
FROM public.contratos c
WHERE NOT EXISTS (SELECT 1 FROM public.sico_ultimo_numero_registro u WHERE u.contrato_id = c.id)
ON CONFLICT (contrato_id) DO NOTHING;

INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
SELECT c.id, 34999
FROM public.contratos c
WHERE NOT EXISTS (SELECT 1 FROM public.sico_ultimo_numero_reporte u WHERE u.contrato_id = c.id)
ON CONFLICT (contrato_id) DO NOTHING;

-- ── Próximo número de línea (API / RPC existente) ──────────────────────────
CREATE OR REPLACE FUNCTION public.siguiente_numero_registro(p_contrato_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  piso   constant integer := 55000;
  m_tab  integer;
  rsv    integer;
  sig    integer;
BEGIN
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;
  SELECT COALESCE(MAX(s.numero_registro), 0) INTO m_tab
  FROM public.so_registros s
  WHERE s.contrato_id = p_contrato_id;
  INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
  VALUES (p_contrato_id, 54999)
  ON CONFLICT (contrato_id) DO NOTHING;
  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_registro u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := 54999;
  END IF;
  sig := GREATEST(piso, m_tab + 1, rsv + 1);
  UPDATE public.sico_ultimo_numero_registro
  SET reservado_hasta = sig
  WHERE contrato_id = p_contrato_id;
  RETURN sig;
END;
$$;

-- ── Próximo número de reporte (POST /reportes) ───────────────────────────
CREATE OR REPLACE FUNCTION public.siguiente_numero_reporte(p_contrato_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  piso   constant integer := 35000;
  m_tab  integer;
  rsv    integer;
  sig    integer;
BEGIN
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;
  SELECT COALESCE(MAX(r.numero_reporte), 0) INTO m_tab
  FROM public.so_reportes r
  WHERE r.contrato_id = p_contrato_id;
  INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
  VALUES (p_contrato_id, 34999)
  ON CONFLICT (contrato_id) DO NOTHING;
  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_reporte u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := 34999;
  END IF;
  sig := GREATEST(piso, m_tab + 1, rsv + 1);
  UPDATE public.sico_ultimo_numero_reporte
  SET reservado_hasta = sig
  WHERE contrato_id = p_contrato_id;
  RETURN sig;
END;
$$;

-- ── Lote: N consecutivos (reemplazar-registros) — una reserva atómica ────
CREATE OR REPLACE FUNCTION public.siguiente_n_numeros_registro(p_contrato_id integer, p_n integer)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  piso   constant integer := 55000;
  m_tab  integer;
  rsv    integer;
  inicio integer;
  fin_   integer;
BEGIN
  IF p_n IS NULL OR p_n < 1 THEN
    RETURN ARRAY[]::integer[];
  END IF;
  IF p_n > 2000 THEN
    RAISE EXCEPTION 'p_n excede 2000';
  END IF;
  SELECT COALESCE(MAX(s.numero_registro), 0) INTO m_tab
  FROM public.so_registros s
  WHERE s.contrato_id = p_contrato_id;
  INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
  VALUES (p_contrato_id, 54999)
  ON CONFLICT (contrato_id) DO NOTHING;
  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_registro u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := 54999;
  END IF;
  inicio := GREATEST(piso, m_tab + 1, rsv + 1);
  fin_ := inicio + p_n - 1;
  UPDATE public.sico_ultimo_numero_registro
  SET reservado_hasta = fin_
  WHERE contrato_id = p_contrato_id;
  RETURN ARRAY(SELECT generate_series(inicio, fin_));
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.sico_ultimo_numero_registro TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sico_ultimo_numero_reporte TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_registro(integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_reporte(integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_n_numeros_registro(integer, integer) TO service_role, authenticated;
