-- Optimiza siguiente_n_numeros_registro: evita array_append en bucle (O(n²) con p_n grande → minutos).
-- Origen canónico en el repo: backend/sql/sico_consecutivos_desde_pisos.sql (piso 55000).
-- Contratos con sicoe_consecutivos_desde_uno: usar backend/sql/sicoe_consecutivos_desde_uno_por_contrato.sql (ya actualizado allí).
-- Ejecutar en Supabase solo si su BD sigue con la versión antigua (bucle).

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
