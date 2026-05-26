-- Agregación para informe de gerencia CC-GER-001 (rápida, en BD).
-- Reutiliza: rpo_panel_linea_cd, rpo_panel_bloque_capitulo, _norm_estado_matriz, rpo_panel_admin_agg.sql
-- Ejecutar en Supabase después de rpo_panel_admin_agg.sql y dashboard_matriz_validacion.sql.

-- Misma regla que dashboard matriz / rpo_panel: prerequisitos de niveles activos inferiores
-- en «Aprobado» y nivel máximo activo del contrato en «Aprobado» (p. ej. [1,2,4] → N4, no N3).
CREATE OR REPLACE FUNCTION public.rpo_ger_registro_interventoria_aprobado(
  p_niveles_activos int[],
  p_n1 text,
  p_n2 text,
  p_n3 text,
  p_n4 text,
  p_n5 text,
  p_n6 text
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $chk$
DECLARE
  nv int[];
  mx int;
  ni int;
  st text;
BEGIN
  nv := COALESCE(p_niveles_activos, ARRAY[]::int[]);
  IF cardinality(nv) = 0 THEN
    nv := ARRAY[1, 2, 3];
  END IF;
  mx := (SELECT max(x) FROM unnest(nv) AS x);
  IF mx IS NULL THEN
    mx := 3;
    nv := ARRAY[1, 2, 3];
  END IF;
  FOREACH ni IN ARRAY nv LOOP
    IF ni < mx THEN
      st := CASE ni
        WHEN 1 THEN p_n1
        WHEN 2 THEN p_n2
        WHEN 3 THEN p_n3
        WHEN 4 THEN p_n4
        WHEN 5 THEN p_n5
        WHEN 6 THEN p_n6
        ELSE NULL
      END;
      IF public._norm_estado_matriz(st) IS DISTINCT FROM 'Aprobado' THEN
        RETURN FALSE;
      END IF;
    END IF;
  END LOOP;
  st := CASE mx
    WHEN 1 THEN p_n1
    WHEN 2 THEN p_n2
    WHEN 3 THEN p_n3
    WHEN 4 THEN p_n4
    WHEN 5 THEN p_n5
    WHEN 6 THEN p_n6
    ELSE NULL
  END;
  RETURN public._norm_estado_matriz(st) = 'Aprobado';
END;
$chk$;

COMMENT ON FUNCTION public.rpo_ger_registro_interventoria_aprobado IS
  'Informe gerencia: fila con ítem y sellado en el nivel máximo activo del contrato (contrato_niveles_validacion).';

-- Sellado interventoría en una o varias actas (col. 2 acta ref. / col. 3 acumulado)
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
  WITH nv AS (
    SELECT coalesce(
      (SELECT c.niveles_activos
         FROM public.contrato_niveles_validacion c
        WHERE c.contrato_id = p_contrato_id
        LIMIT 1),
      ARRAY[1, 2, 3]::int[]
    ) AS arr
  ),
  base AS (
    SELECT
      COALESCE(
        nullif(btrim(COALESCE(r.capitulo, '')), ''),
        'Sin capítulo'
      ) AS ccap,
      public.rpo_panel_bloque_capitulo(r.capitulo) AS bloq,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln
    FROM public.so_registros r
    CROSS JOIN nv
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY(p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public.rpo_ger_registro_interventoria_aprobado(
        nv.arr,
        r.nivel1_estado,
        r.nivel2_estado,
        r.nivel3_estado,
        r.nivel4_estado,
        r.nivel5_estado,
        r.nivel6_estado
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

COMMENT ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_cascade IS
  'Informe gerencia col.2: acta referencia con sellado interventoría (nivel máximo activo del contrato).';

-- Col. 3 (Total aprobados interventoría): sellado en nivel máximo activo; acumulado en varias actas
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
  WITH nv AS (
    SELECT coalesce(
      (SELECT c.niveles_activos
         FROM public.contrato_niveles_validacion c
        WHERE c.contrato_id = p_contrato_id
        LIMIT 1),
      ARRAY[1, 2, 3]::int[]
    ) AS arr
  ),
  base AS (
    SELECT
      COALESCE(
        nullif(btrim(COALESCE(r.capitulo, '')), ''),
        'Sin capítulo'
      ) AS ccap,
      public.rpo_panel_bloque_capitulo(r.capitulo) AS bloq,
      public.rpo_panel_linea_cd(r.costo_directo, r.cantidad_total, r.vlr_unitario) AS ln
    FROM public.so_registros r
    CROSS JOIN nv
    WHERE r.contrato_id = p_contrato_id
      AND r.acta_rpo_id IS NOT NULL
      AND r.acta_rpo_id = ANY(p_acta_ids)
      AND btrim(COALESCE(r.item_numero, '')) <> ''
      AND public.rpo_ger_registro_interventoria_aprobado(
        nv.arr,
        r.nivel1_estado,
        r.nivel2_estado,
        r.nivel3_estado,
        r.nivel4_estado,
        r.nivel5_estado,
        r.nivel6_estado
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

COMMENT ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_solo_n3 IS
  'Informe gerencia col.3: total aprobado interventoría (nivel máximo activo); acumulable en p_acta_ids.';

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

GRANT EXECUTE ON FUNCTION public.rpo_ger_registro_interventoria_aprobado(int[], text, text, text, text, text, text) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_cascade(bigint, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_solo_n3(bigint, bigint[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_col1_hab_cobro(bigint, bigint, text[]) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpo_ger_suma_por_capitulo_bloque_pendiente(bigint, bigint) TO service_role, authenticated, anon;
