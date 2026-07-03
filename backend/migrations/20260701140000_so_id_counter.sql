-- ClaraCore / ClaraCAD — contador global atómico de sufijos ID_POL por contrato
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS public.so_id_counter (
  contrato_id integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  reservado_hasta integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.so_id_counter IS
  'Último sufijo numérico reservado para ID_POL (ClaraCAD) por contrato.';

-- Sincronizar desde presupuesto existente (máximo sufijo numérico en id_pol).
INSERT INTO public.so_id_counter (contrato_id, reservado_hasta)
SELECT p.contrato_id,
       COALESCE(MAX(
         CASE
           WHEN p.id_pol ~ '^\d+$' THEN p.id_pol::integer
           WHEN p.id_pol ~ '_\d+$' THEN NULLIF(regexp_replace(p.id_pol, '^.*_', ''), '')::integer
           ELSE NULL
         END
       ), 0) AS max_sufijo
FROM public.presupuesto p
WHERE p.id_pol IS NOT NULL AND trim(p.id_pol) <> ''
GROUP BY p.contrato_id
ON CONFLICT (contrato_id) DO UPDATE
SET reservado_hasta = GREATEST(public.so_id_counter.reservado_hasta, EXCLUDED.reservado_hasta);

-- Contratos sin filas en presupuesto: fila en cero.
INSERT INTO public.so_id_counter (contrato_id, reservado_hasta)
SELECT c.id, 0
FROM public.contratos c
WHERE NOT EXISTS (
  SELECT 1 FROM public.so_id_counter u WHERE u.contrato_id = c.id
);

CREATE OR REPLACE FUNCTION public._so_id_pol_max_en_presupuesto(p_contrato_id integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(
    CASE
      WHEN p.id_pol ~ '^\d+$' THEN p.id_pol::integer
      WHEN p.id_pol ~ '_\d+$' THEN NULLIF(regexp_replace(p.id_pol, '^.*_', ''), '')::integer
      ELSE NULL
    END
  ), 0)
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND p.id_pol IS NOT NULL
    AND trim(p.id_pol) <> '';
$$;

-- Reserva atómica de N sufijos consecutivos (FOR UPDATE + generate_series).
CREATE OR REPLACE FUNCTION public.siguiente_n_ids_pol(p_contrato_id integer, p_n integer)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  m_tab := public._so_id_pol_max_en_presupuesto(p_contrato_id);

  INSERT INTO public.so_id_counter (contrato_id, reservado_hasta)
  VALUES (p_contrato_id, 0)
  ON CONFLICT (contrato_id) DO NOTHING;

  SELECT u.reservado_hasta INTO rsv
  FROM public.so_id_counter u
  WHERE u.contrato_id = p_contrato_id
  FOR UPDATE;

  IF rsv IS NULL THEN
    rsv := 0;
  END IF;

  inicio := GREATEST(m_tab + 1, rsv + 1);
  fin_ := inicio + p_n - 1;

  UPDATE public.so_id_counter
  SET reservado_hasta = fin_
  WHERE contrato_id = p_contrato_id;

  RETURN ARRAY(SELECT generate_series(inicio, fin_));
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.so_id_counter TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_n_ids_pol(integer, integer) TO service_role, authenticated;
