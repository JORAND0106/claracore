-- Si el contrato usa sicoe_consecutivos_desde_uno pero el contador quedó en piso legacy
-- (34999/54999 o superior), ignorar ese reservado_hasta y numerar desde MAX(tabla)+1.

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
  desde_uno boolean := false;
BEGIN
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;
  SELECT COALESCE(c.sicoe_consecutivos_desde_uno, false) INTO desde_uno
  FROM public.contratos c
  WHERE c.id = p_contrato_id;
  IF desde_uno IS NULL THEN
    desde_uno := false;
  END IF;

  SELECT COALESCE(MAX(s.numero_registro), 0) INTO m_tab
  FROM public.so_registros s
  WHERE s.contrato_id = p_contrato_id;

  IF desde_uno THEN
    INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 0)
    ON CONFLICT (contrato_id) DO NOTHING;
  ELSE
    INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 54999)
    ON CONFLICT (contrato_id) DO NOTHING;
  END IF;

  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_registro u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := CASE WHEN desde_uno THEN 0 ELSE 54999 END;
  END IF;

  IF desde_uno AND rsv >= piso THEN
    rsv := m_tab;
  END IF;

  IF desde_uno THEN
    sig := GREATEST(m_tab + 1, rsv + 1);
  ELSE
    sig := GREATEST(piso, m_tab + 1, rsv + 1);
  END IF;

  UPDATE public.sico_ultimo_numero_registro
  SET reservado_hasta = sig
  WHERE contrato_id = p_contrato_id;
  RETURN sig;
END;
$$;

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
  desde_uno boolean := false;
BEGIN
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;
  SELECT COALESCE(c.sicoe_consecutivos_desde_uno, false) INTO desde_uno
  FROM public.contratos c
  WHERE c.id = p_contrato_id;
  IF desde_uno IS NULL THEN
    desde_uno := false;
  END IF;

  SELECT COALESCE(MAX(r.numero_reporte), 0) INTO m_tab
  FROM public.so_reportes r
  WHERE r.contrato_id = p_contrato_id;

  IF desde_uno THEN
    INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 0)
    ON CONFLICT (contrato_id) DO NOTHING;
  ELSE
    INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 34999)
    ON CONFLICT (contrato_id) DO NOTHING;
  END IF;

  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_reporte u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := CASE WHEN desde_uno THEN 0 ELSE 34999 END;
  END IF;

  IF desde_uno AND rsv >= piso THEN
    rsv := m_tab;
  END IF;

  IF desde_uno THEN
    sig := GREATEST(m_tab + 1, rsv + 1);
  ELSE
    sig := GREATEST(piso, m_tab + 1, rsv + 1);
  END IF;

  UPDATE public.sico_ultimo_numero_reporte
  SET reservado_hasta = sig
  WHERE contrato_id = p_contrato_id;
  RETURN sig;
END;
$$;

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
  desde_uno boolean := false;
BEGIN
  IF p_n IS NULL OR p_n < 1 THEN
    RETURN ARRAY[]::integer[];
  END IF;
  IF p_n > 2000 THEN
    RAISE EXCEPTION 'p_n excede 2000';
  END IF;
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;

  SELECT COALESCE(c.sicoe_consecutivos_desde_uno, false) INTO desde_uno
  FROM public.contratos c
  WHERE c.id = p_contrato_id;
  IF desde_uno IS NULL THEN
    desde_uno := false;
  END IF;

  SELECT COALESCE(MAX(s.numero_registro), 0) INTO m_tab
  FROM public.so_registros s
  WHERE s.contrato_id = p_contrato_id;

  IF desde_uno THEN
    INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 0)
    ON CONFLICT (contrato_id) DO NOTHING;
  ELSE
    INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
    VALUES (p_contrato_id, 54999)
    ON CONFLICT (contrato_id) DO NOTHING;
  END IF;

  SELECT u.reservado_hasta INTO rsv
  FROM public.sico_ultimo_numero_registro u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;
  IF rsv IS NULL THEN
    rsv := CASE WHEN desde_uno THEN 0 ELSE 54999 END;
  END IF;

  IF desde_uno AND rsv >= piso THEN
    rsv := m_tab;
  END IF;

  IF desde_uno THEN
    inicio := GREATEST(m_tab + 1, rsv + 1);
  ELSE
    inicio := GREATEST(piso, m_tab + 1, rsv + 1);
  END IF;
  fin_ := inicio + p_n - 1;
  UPDATE public.sico_ultimo_numero_registro
  SET reservado_hasta = fin_
  WHERE contrato_id = p_contrato_id;
  RETURN ARRAY(SELECT generate_series(inicio, fin_));
END;
$$;
