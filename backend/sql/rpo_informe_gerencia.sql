-- Agregación para informe de gerencia CC-GER-001 (rápida, en BD).
-- Reutiliza: rpo_panel_linea_cd, rpo_panel_bloque_capitulo, _norm_estado_matriz, rpo_panel_admin_agg.sql
-- Ejecutar en Supabase después de rpo_panel_admin_agg.sql y dashboard_matriz_validacion.sql.

-- Cascada N1·N2·N3 aprob. en una o varias actas, suma por capítulo y bloque obra/ensayos
CREATE OR REPLACE FUNCTION public.rpo_ger_suma_por_capitulo_bloque_cascade(
  p_contrato_id bigint,
  p_acta_ids   bigint[]
) RETURNS TABLE(
  capitulo text,
  bloque   text,
  sum_cd   numeric
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
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY(p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public._norm_estado_matriz(r.nivel1_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel2_estado) = 'Aprobado'
      AND public._norm_estado_matriz(r.nivel3_estado) = 'Aprobado'
  )
  SELECT
    b.ccap,
    b.bloq,
    (sum(b.ln))::numeric
  FROM base b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

COMMENT ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_cascade IS
  'Informe gerencia: columna 2 = acta referencia: cascada N1·N2·N3 (listado de actas / rpo_panel).';

-- Col. 3 (Total aprobados interventoría): solo nivel3 = Aprobado, misma línea que rpo_panel; acumulado en varias actas
CREATE OR REPLACE FUNCTION public.rpo_ger_suma_por_capitulo_bloque_solo_n3(
  p_contrato_id bigint,
  p_acta_ids   bigint[]
) RETURNS TABLE(
  capitulo text,
  bloque   text,
  sum_cd   numeric
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
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY(p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public._norm_estado_matriz(r.nivel3_estado) = 'Aprobado'
  )
  SELECT
    b.ccap,
    b.bloq,
    (sum(b.ln))::numeric
  FROM base b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

COMMENT ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_solo_n3 IS
  'Informe gerencia col.3: suma con ítem asignado, únicamente interventoría (nivel3) Aprobado, acumulable en p_acta_ids.';

-- Col. 1: acta presente = misma noción que «HABILITADO VALIDACIÓN» en dashboard_matriz_validacion (Inspector):
-- todas las filas con ítem asignado, independiente de N1/N2/N3. Monto: COALESCE(costo_directo,0) como en
-- la CTE `base` de dashboard_matriz_validacion_agg (no rpo_panel_linea_cd; no filtro cobro).
-- p_items_cobro se ignora (compat. firma); si en el futuro hiciera falta, reintroducir con cuidado.
CREATE OR REPLACE FUNCTION public.rpo_ger_suma_por_capitulo_bloque_col1_hab_cobro(
  p_contrato_id bigint,
  p_acta_id     bigint,
  p_items_cobro text[]     -- ignorado: columna 1 = todo ítem con registro
) RETURNS TABLE(
  capitulo text,
  bloque   text,
  sum_cd   numeric
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
      COALESCE(r.costo_directo, 0)::numeric AS ln
    FROM public.so_registros r
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id = p_acta_id
      AND btrim(COALESCE(r.item_numero, '')) <> ''
  )
  SELECT
    b.ccap,
    b.bloq,
    (sum(b.ln))::numeric
  FROM base b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

-- Col. 4: al menos un nivel con estado normalizado = Pendiente (acta presente)
CREATE OR REPLACE FUNCTION public.rpo_ger_suma_por_capitulo_bloque_pendiente(
  p_contrato_id bigint,
  p_acta_id     bigint
) RETURNS TABLE(
  capitulo text,
  bloque   text,
  sum_cd   numeric
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
      AND (
        public._norm_estado_matriz(r.nivel1_estado) = 'Pendiente'
        OR public._norm_estado_matriz(r.nivel2_estado) = 'Pendiente'
        OR public._norm_estado_matriz(r.nivel3_estado) = 'Pendiente'
      )
  )
  SELECT
    b.ccap,
    b.bloq,
    (sum(b.ln))::numeric
  FROM base b
  GROUP BY b.ccap, b.bloq
  ORDER BY b.bloq, b.ccap;
$f$;

GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_cascade(bigint, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_solo_n3(bigint, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_col1_hab_cobro(bigint, bigint, text[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_pendiente(bigint, bigint) TO service_role, authenticated, anon;
