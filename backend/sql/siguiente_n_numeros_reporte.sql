-- Reserva N números de reporte en una sola llamada RPC (misma regla que siguiente_numero_reporte).
-- Ejecutar en Supabase SQL Editor si migración masiva dashboard es lenta (cientos de PK por lote).
-- Si la función ya existe, CREATE OR REPLACE la actualiza.

CREATE OR REPLACE FUNCTION public.siguiente_n_numeros_reporte(p_contrato_id integer, p_n integer)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res integer[] := ARRAY[]::integer[];
  i integer;
BEGIN
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'p_contrato_id requerido';
  END IF;
  IF p_n IS NULL OR p_n < 1 THEN
    RETURN res;
  END IF;
  IF p_n > 2000 THEN
    RAISE EXCEPTION 'p_n excede 2000';
  END IF;
  FOR i IN 1..p_n LOOP
    res := array_append(res, public.siguiente_numero_reporte(p_contrato_id));
  END LOOP;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.siguiente_n_numeros_reporte(integer, integer) TO service_role, authenticated;
