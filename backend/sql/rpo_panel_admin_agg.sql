-- Agregación en base de datos para el panel admin «Actas» (costo RPO alineado a la matriz de validación).
-- Evita leer y paginar miles de filas de so_registros en Python.
-- Ejecutar en Supabase SQL Editor (o psql) una vez.
--
-- Requisitos: existan public._norm_estado_matriz (dashboard_matriz_validacion.sql) y so_registros con
-- item_numero, costo_directo, cantidad_total, vlr_unitario, capitulo, nivel1/2/3_estado, acta_rpo_id, contrato_id.

-- Línea de costo: mismas reglas que backend/ccd_conciliacion._linea_costo_registro
CREATE OR REPLACE FUNCTION public.rpo_panel_linea_cd(
  costo_directo   numeric,
  cantidad_total  numeric,
  vlr_unitario    numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT COALESCE(
    CASE
      WHEN abs(COALESCE(costo_directo, 0)::numeric) > 0.0000001
        THEN costo_directo::numeric
      ELSE COALESCE(cantidad_total, 0)::numeric * COALESCE(vlr_unitario, 0)::numeric
    END,
    0
  )::numeric;
$f$;

-- Bloque obra / ensayos: misma lógica que _bloque_capitulo_matriz y dashboard SQL
CREATE OR REPLACE FUNCTION public.rpo_panel_bloque_capitulo(p_capitulo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN upper(btrim(COALESCE(p_capitulo, ''))) LIKE '14.%'
      OR upper(btrim(COALESCE(p_capitulo, ''))) LIKE '15.%'
      OR position('ENSAYO' IN upper(btrim(COALESCE(p_capitulo, '')))) > 0
      OR position('SONDEO' IN upper(btrim(COALESCE(p_capitulo, '')))) > 0
    THEN 'ensayos'
    ELSE 'obra'
  END;
$f$;

COMMENT ON FUNCTION public.rpo_panel_linea_cd(numeric, numeric, numeric) IS
  'Costo por línea SICOE (so_registros) alineado a ccd_conciliacion._linea_costo_registro.';
COMMENT ON FUNCTION public.rpo_panel_bloque_capitulo(text) IS
  'Obra vs ensayos/sondeos (matriz de validación).';

-- Suma y conteo por acta (varios acta_rpo_id a la vez; una fila por acta con movimiento)
CREATE OR REPLACE FUNCTION public.rpo_panel_actas_resumen(
  p_contrato_id bigint,
  p_acta_ids    bigint[]
) RETURNS TABLE(acta_rpo_id bigint, total_cd numeric, n_reg bigint)
LANGUAGE sql
STABLE
AS $f$
  WITH base AS (
    SELECT
      r.acta_rpo_id AS aid,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln
    FROM public.so_registros r
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY (p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public._norm_estado_matriz(r.nivel1_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel2_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel3_estado) = 'Aprobado'
  )
  SELECT
    b.aid,
    sum(b.ln)::numeric    AS total_cd,
    (count(*))::bigint   AS n_reg
  FROM base b
  GROUP BY b.aid
  ORDER BY b.aid;
$f$;

-- Agregado por capítulo y bloque para un solo acta (decenas/centenas de filas de resultado, no miles de SICOE)
CREATE OR REPLACE FUNCTION public.rpo_panel_acta_por_capitulo_bloque(
  p_contrato_id bigint,
  p_acta_id     bigint
) RETURNS TABLE(
  capitulo text,
  bloque   text,
  sum_cd   numeric,
  n_reg    bigint
)
LANGUAGE sql
STABLE
AS $f$
  WITH base AS (
    SELECT
      COALESCE(
        nullif(btrim(COALESCE(r.capitulo, '')), ''),
        'Sin capítulo'
      ) AS ccap,
      public.rpo_panel_bloque_capitulo(r.capitulo) AS bloq,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln
    FROM public.so_registros r
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id = p_acta_id
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public._norm_estado_matriz(r.nivel1_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel2_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel3_estado) = 'Aprobado'
  )
  SELECT
    b.ccap  AS capitulo,
    b.bloq  AS bloque,
    sum(b.ln)::numeric  AS sum_cd,
    (count(*))::bigint  AS n_reg
  FROM base b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

COMMENT ON FUNCTION public.rpo_panel_actas_resumen(bigint, bigint[]) IS
  'Resumen de costo cascade N1·N2·N3 aprob. por acta (panel actas, grilla).';
COMMENT ON FUNCTION public.rpo_panel_acta_por_capitulo_bloque(bigint, bigint) IS
  'Suma por capítulo y bloque obra/ensayos para un acta (popup desglose).';

GRANT EXECUTE ON FUNCTION public.rpo_panel_linea_cd(numeric, numeric, numeric) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_bloque_capitulo(text) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_actas_resumen(bigint, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_acta_por_capitulo_bloque(bigint, bigint) TO service_role, authenticated, anon;

-- Opcional: acelera el filtro típico del panel (idempotente).
CREATE INDEX IF NOT EXISTS idx_so_registros_rpo_panel_cascade
  ON public.so_registros (contrato_id, acta_rpo_id)
  WHERE btrim(COALESCE(item_numero, '')) <> '';

