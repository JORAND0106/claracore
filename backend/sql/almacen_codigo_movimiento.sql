-- Códigos únicos Ent-/Sal- por contrato (Ent-1614-00001, Sal-1614-00001).

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS codigo text;

ALTER TABLE public.almacen_salida
  ADD COLUMN IF NOT EXISTS codigo text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_entrada_codigo_contrato
  ON public.almacen_entrada (contrato_id, codigo)
  WHERE codigo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_salida_codigo_contrato
  ON public.almacen_salida (contrato_id, codigo)
  WHERE codigo IS NOT NULL;

COMMENT ON COLUMN public.almacen_entrada.codigo IS
  'Código único de entrada: Ent-{segmento contrato}-{consecutivo 5 dígitos}.';
COMMENT ON COLUMN public.almacen_salida.codigo IS
  'Código único de salida: Sal-{segmento contrato}-{consecutivo 5 dígitos}.';

-- Segmento numérico del contrato (misma lógica que catalogo_insumos_service.contrato_codigo_segment).
CREATE OR REPLACE FUNCTION public._almacen_contrato_segmento(p_contrato_id bigint)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT m[1]
      FROM public.contratos c,
      LATERAL regexp_matches(COALESCE(c.numero, ''), '\d+', 'g') AS m
      WHERE c.id = p_contrato_id
        AND m[1] IS NOT NULL
        AND m[1] NOT BETWEEN '2020' AND '2035'
      LIMIT 1
    ),
    p_contrato_id::text
  );
$$;

-- Backfill códigos existentes.
UPDATE public.almacen_entrada e
SET codigo = 'Ent-' || public._almacen_contrato_segmento(e.contrato_id) || '-'
  || lpad(COALESCE(e.numero_entrada, 0)::text, 5, '0')
WHERE (e.codigo IS NULL OR btrim(e.codigo) = '')
  AND COALESCE(e.numero_entrada, 0) > 0;

UPDATE public.almacen_salida s
SET codigo = 'Sal-' || public._almacen_contrato_segmento(s.contrato_id) || '-'
  || lpad(COALESCE(s.numero_salida, 0)::text, 5, '0')
WHERE (s.codigo IS NULL OR btrim(s.codigo) = '')
  AND COALESCE(s.numero_salida, 0) > 0;

GRANT EXECUTE ON FUNCTION public._almacen_contrato_segmento(bigint) TO authenticated, service_role;
