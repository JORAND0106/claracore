-- Agregación en base de datos para el panel admin «Actas» (costo RPO alineado a la matriz de validación).
-- Requiere: public._norm_estado_matriz, _dash_matriz_nivel_max_estado, _dash_prereqs_activos_aprobados_norm
--   (dashboard_drill_agg.sql) y so_registros con nivel1..nivel6_estado.
-- Ejecutar en Supabase SQL Editor tras actualizar dashboard_drill_agg.sql.

DROP FUNCTION IF EXISTS public.rpo_panel_actas_resumen(bigint, bigint[]);
DROP FUNCTION IF EXISTS public.rpo_panel_acta_por_capitulo_bloque(bigint, bigint);

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

-- Suma y conteo por acta: último nivel activo aprobado + prerequisitos (misma regla que dashboard drill)
CREATE OR REPLACE FUNCTION public.rpo_panel_actas_resumen(
  p_contrato_id       bigint,
  p_acta_ids          bigint[],
  p_campo_nivel_max   text DEFAULT 'nivel3_estado',
  p_niveles_activos   bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
) RETURNS TABLE(acta_rpo_id bigint, total_cd numeric, n_reg bigint)
LANGUAGE sql
STABLE
AS $f$
  WITH base AS (
    SELECT
      r.acta_rpo_id AS aid,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln,
      public._norm_estado_matriz(r.nivel1_estado) AS n1,
      public._norm_estado_matriz(r.nivel2_estado) AS n2,
      public._norm_estado_matriz(r.nivel3_estado) AS n3,
      public._norm_estado_matriz(r.nivel4_estado) AS n4,
      public._norm_estado_matriz(r.nivel5_estado) AS n5,
      public._norm_estado_matriz(r.nivel6_estado) AS n6
    FROM public.so_registros r
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY (p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
  ),
  aprob AS (
    SELECT b.aid, b.ln
    FROM base b
    WHERE public._dash_prereqs_activos_aprobados_norm(
            p_niveles_activos,
            public._dash_nivel_num_desde_campo(p_campo_nivel_max),
            b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
          )
      AND public._dash_matriz_nivel_max_estado(
            p_campo_nivel_max,
            b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
          ) = 'Aprobado'
  )
  SELECT
    a.aid,
    sum(a.ln)::numeric    AS total_cd,
    (count(*))::bigint   AS n_reg
  FROM aprob a
  GROUP BY a.aid
  ORDER BY a.aid;
$f$;

CREATE OR REPLACE FUNCTION public.rpo_panel_acta_por_capitulo_bloque(
  p_contrato_id       bigint,
  p_acta_id           bigint,
  p_campo_nivel_max   text DEFAULT 'nivel3_estado',
  p_niveles_activos   bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
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
      COALESCE(nullif(btrim(COALESCE(r.capitulo, '')), ''), 'Sin capítulo') AS ccap,
      public.rpo_panel_bloque_capitulo(r.capitulo) AS bloq,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln,
      public._norm_estado_matriz(r.nivel1_estado) AS n1,
      public._norm_estado_matriz(r.nivel2_estado) AS n2,
      public._norm_estado_matriz(r.nivel3_estado) AS n3,
      public._norm_estado_matriz(r.nivel4_estado) AS n4,
      public._norm_estado_matriz(r.nivel5_estado) AS n5,
      public._norm_estado_matriz(r.nivel6_estado) AS n6
    FROM public.so_registros r
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id = p_acta_id
      AND btrim(COALESCE(r.item_numero, '')) <> ''
  ),
  aprob AS (
    SELECT b.ccap, b.bloq, b.ln
    FROM base b
    WHERE public._dash_prereqs_activos_aprobados_norm(
            p_niveles_activos,
            public._dash_nivel_num_desde_campo(p_campo_nivel_max),
            b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
          )
      AND public._dash_matriz_nivel_max_estado(
            p_campo_nivel_max,
            b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
          ) = 'Aprobado'
  )
  SELECT
    b.ccap  AS capitulo,
    b.bloq  AS bloque,
    sum(b.ln)::numeric  AS sum_cd,
    (count(*))::bigint  AS n_reg
  FROM aprob b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

COMMENT ON FUNCTION public.rpo_panel_actas_resumen(bigint, bigint[], text, bigint[]) IS
  'Resumen costo por acta: último nivel activo aprobado + prerequisitos (panel Actas).';
COMMENT ON FUNCTION public.rpo_panel_acta_por_capitulo_bloque(bigint, bigint, text, bigint[]) IS
  'Desglose por capítulo/bloque para un acta (popup RPO).';

GRANT EXECUTE ON FUNCTION public.rpo_panel_linea_cd(numeric, numeric, numeric) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_bloque_capitulo(text) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_actas_resumen(bigint, bigint[], text, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_panel_acta_por_capitulo_bloque(bigint, bigint, text, bigint[]) TO service_role, authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_so_registros_rpo_panel_cascade
  ON public.so_registros (contrato_id, acta_rpo_id)
  WHERE btrim(COALESCE(item_numero, '')) <> '';
