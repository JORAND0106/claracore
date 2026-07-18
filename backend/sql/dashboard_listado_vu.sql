-- V.U. vigente del Listado de Precios por (contrato, capítulo, ítem).
-- Fuente de verdad para costo agregado dashboard (ClaraCore y Cobrado).

CREATE OR REPLACE FUNCTION public._dash_listado_vu(
  p_contrato_id bigint,
  p_capitulo text,
  p_item text
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT lp.precio_unitario::numeric
      FROM public.listado_precios lp
      WHERE lp.contrato_id = p_contrato_id
        AND public._dash_norm_capitulo_key(lp.capitulo) = public._dash_norm_capitulo_key(p_capitulo)
        AND public._dash_norm_item_key(lp.item_numero) = public._dash_norm_item_key(p_item)
      ORDER BY lp.id DESC
      LIMIT 1
    ),
    0::numeric
  );
$$;

COMMENT ON FUNCTION public._dash_listado_vu(bigint, text, text) IS
  'V.U. vigente listado_precios para capítulo+ítem; 0 si no existe.';

GRANT EXECUTE ON FUNCTION public._dash_listado_vu(bigint, text, text) TO authenticated, service_role;
