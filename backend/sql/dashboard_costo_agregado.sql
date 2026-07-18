-- Agregación monetaria dashboard: round(Σ cantidades × V.U., 0) — un solo redondeo al final.
-- Ejecutar en Supabase antes de actualizar dashboard_drill_agg / resumen / matriz.

CREATE OR REPLACE FUNCTION public.dash_costo_agregado(p_cant numeric, p_vu numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_cant, 0) = 0 OR COALESCE(p_vu, 0) = 0 THEN 0::numeric
    ELSE round(round(COALESCE(p_cant, 0), 2) * COALESCE(p_vu, 0), 0)
  END;
$$;

COMMENT ON FUNCTION public.dash_costo_agregado(numeric, numeric) IS
  'Costo agregado dashboard: round(round(cant,2)×VU, 0). No usar SUM(costo_directo) para totales.';

GRANT EXECUTE ON FUNCTION public.dash_costo_agregado(numeric, numeric) TO authenticated, service_role, anon;
