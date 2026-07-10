-- Agregación en base de datos para /sicoe-obra/.../dashboard-matriz-validacion (rendimiento ~segundos).
--
-- DESPLIEGUE (Supabase SQL Editor): ejecutar TODO este archivo de una vez.
-- Es idempotente: se puede re-ejecutar tras cambios. El editor puede avisar que se
-- eliminarán funciones/vista al inicio; es normal: se recrean al final del mismo script.
--
-- Regla de negocio (cascada por niveles activos del contrato):
--   - N_min (menor nivel activo): clasifica todas las filas del acta.
--   - Nivel N (> N_min): solo filas con TODOS los niveles activos < N en Aprobado.
--   - Claves de salida: nivel1..nivel6 (no inspector/residente/interventoria).
-- Fila «pendiente_item»: estado Pendiente en el nivel mínimo activo (columna nivel{n_min}).

-- ── Prerequisito: costo agregado cant×VU (también en dashboard_costo_agregado.sql) ──
CREATE OR REPLACE FUNCTION public.dash_costo_agregado(p_cant numeric, p_vu numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_cant, 0) = 0 OR COALESCE(p_vu, 0) = 0 THEN 0::numeric
    ELSE round(COALESCE(p_cant, 0) * COALESCE(p_vu, 0), 0)
  END;
$$;

COMMENT ON FUNCTION public.dash_costo_agregado(numeric, numeric) IS
  'Costo agregado dashboard: round(cant×VU, 0). No usar SUM(costo_directo) para totales.';

GRANT EXECUTE ON FUNCTION public.dash_costo_agregado(numeric, numeric) TO authenticated, service_role, anon;

-- ── Recrear vista y funciones matriz (orden explícito, sin CASCADE) ──
DROP FUNCTION IF EXISTS public.dashboard_matriz_validacion_vigente_bundle(bigint);
DROP FUNCTION IF EXISTS public.dashboard_matriz_validacion_agg(bigint, bigint, text);
DROP FUNCTION IF EXISTS public.dashboard_matriz_validacion_agg(bigint, bigint);
DROP VIEW IF EXISTS public.vista_so_registros_matriz_validacion;

CREATE VIEW public.vista_so_registros_matriz_validacion
WITH (security_invoker = true) AS
SELECT
  r.contrato_id,
  r.acta_rpo_id,
  r.capitulo,
  r.item_numero,
  r.cantidad_total,
  r.vlr_unitario,
  r.nivel1_estado,
  r.nivel2_estado,
  r.nivel3_estado,
  r.nivel4_estado,
  r.nivel5_estado,
  r.nivel6_estado,
  r.sub_estado
FROM public.so_registros r
WHERE COALESCE(TRIM(r.item_numero), '') <> '';

COMMENT ON VIEW public.vista_so_registros_matriz_validacion IS
  'Filas con ítem asignado y columnas necesarias para dashboard_matriz_validacion_agg.';

GRANT SELECT ON public.vista_so_registros_matriz_validacion TO authenticated, service_role, anon;

-- Acelera filtro por contrato + acta (caso típico: un acta RPO vigente).
CREATE INDEX IF NOT EXISTS idx_so_registros_matriz_contrato_acta
  ON public.so_registros (contrato_id, acta_rpo_id)
  WHERE btrim(COALESCE(item_numero, '')) <> '';

CREATE OR REPLACE FUNCTION public._norm_estado_matriz(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN v IS NULL OR length(trim(v)) = 0 THEN 'No Revisado'
    WHEN lower(trim(v)) = 'aprobado' THEN 'Aprobado'
    WHEN lower(trim(v)) = 'pendiente' THEN 'Pendiente'
    WHEN lower(trim(v)) = 'rechazado' THEN 'Rechazado'
    WHEN lower(trim(v)) LIKE '%no revis%' THEN 'No Revisado'
    ELSE trim(v)
  END;
$f$;

-- Estado normalizado del nivel N (1..6) en una fila de la matriz.
CREATE OR REPLACE FUNCTION public._matriz_estado_nivel(
  p_n smallint,
  p_n1 text, p_n2 text, p_n3 text, p_n4 text, p_n5 text, p_n6 text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE p_n
    WHEN 1 THEN p_n1
    WHEN 2 THEN p_n2
    WHEN 3 THEN p_n3
    WHEN 4 THEN p_n4
    WHEN 5 THEN p_n5
    WHEN 6 THEN p_n6
    ELSE 'No Revisado'
  END;
$f$;

-- True si todos los niveles activos estrictamente menores a p_nivel están Aprobado.
CREATE OR REPLACE FUNCTION public._matriz_prereqs_ok(
  p_na bigint[],
  p_nivel smallint,
  p_n1 text, p_n2 text, p_n3 text, p_n4 text, p_n5 text, p_n6 text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_na, ARRAY[]::bigint[])) AS u(n)
    WHERE u.n::smallint < p_nivel
      AND public._matriz_estado_nivel(
            u.n::smallint, p_n1, p_n2, p_n3, p_n4, p_n5, p_n6
          ) IS DISTINCT FROM 'Aprobado'
  );
$f$;

CREATE OR REPLACE FUNCTION public.dashboard_matriz_validacion_agg(p_contrato_id bigint, p_acta_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $BODY$
WITH scaffold AS (
  SELECT unnest(ARRAY['obra', 'ensayos']) AS bloque
),
cfg AS (
  SELECT COALESCE(
    (SELECT c.niveles_activos::bigint[] FROM public.contrato_niveles_validacion c WHERE c.contrato_id = p_contrato_id),
    ARRAY[1::bigint, 2::bigint, 3::bigint]
  ) AS na
),
cfg_min AS (
  SELECT
    c.na,
    (SELECT min(u::smallint) FROM unnest(c.na) AS u(u)) AS n_min
  FROM cfg c
),
niveles AS (
  SELECT u::smallint AS n
  FROM cfg_min cm, LATERAL unnest(cm.na) AS u(u)
),
base AS (
  SELECT
    COALESCE(r.cantidad_total, 0)::numeric AS cq,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    public._dash_norm_item_key(r.item_numero) AS it,
    public._dash_norm_capitulo_key(r.capitulo) AS cap_k,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6,
    CASE
      WHEN upper(trim(COALESCE(r.capitulo, ''))) LIKE '14.%' OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '15.%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%ENSAYO%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%SONDEO%'
      THEN 'ensayos'
      ELSE 'obra'
    END AS bloque,
    r.acta_rpo_id AS aid
  FROM public.vista_so_registros_matriz_validacion r
  WHERE r.contrato_id = p_contrato_id
    AND (p_acta_id IS NULL OR r.acta_rpo_id = p_acta_id)
    AND public._dash_norm_item_key(r.item_numero) IS NOT NULL
),
-- Una fila por (bloque, ítem, nivel activo): cantidad neta en cada bucket de estado.
item_nivel AS (
  SELECT
    b.bloque,
    b.cap_k,
    b.it,
    nv.n AS nivel,
    MAX(b.vu) AS vu,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        OR public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
      THEN CASE
        WHEN public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6) = 'Aprobado'
          THEN b.cq ELSE 0 END
      ELSE 0
    END) AS q_apr,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        OR public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
      THEN CASE
        WHEN public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6) = 'Pendiente'
          THEN b.cq ELSE 0 END
      ELSE 0
    END) AS q_pend,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        OR public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
      THEN CASE
        WHEN public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6) = 'Rechazado'
          THEN b.cq ELSE 0 END
      ELSE 0
    END) AS q_rej,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        OR public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
      THEN CASE
        WHEN public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6)
               NOT IN ('Aprobado', 'Pendiente', 'Rechazado')
          THEN b.cq ELSE 0 END
      ELSE 0
    END) AS q_nr,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        OR public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
      THEN b.cq ELSE 0
    END) AS q_hab,
    SUM(CASE
      WHEN nv.n = (SELECT n_min FROM cfg_min)
        AND public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6) = 'Pendiente'
      THEN b.cq ELSE 0
    END) AS q_pend_item
  FROM base b
  CROSS JOIN niveles nv
  GROUP BY b.bloque, b.cap_k, b.it, nv.n
),
main_nivel AS (
  SELECT
    bloque,
    nivel,
    SUM(public.dash_costo_agregado(q_apr, vu)) AS aprobado,
    SUM(public.dash_costo_agregado(q_pend, vu)) AS pendiente,
    SUM(public.dash_costo_agregado(q_pend_item, vu)) AS pendiente_item,
    SUM(public.dash_costo_agregado(q_nr, vu)) AS no_revisado,
    SUM(public.dash_costo_agregado(q_rej, vu)) AS rechazado,
    SUM(public.dash_costo_agregado(q_hab, vu)) AS habilitado
  FROM item_nivel
  GROUP BY bloque, nivel
),
main_full AS (
  SELECT
    s.bloque,
    n.n AS nivel,
    COALESCE(m.aprobado, 0) AS aprobado,
    COALESCE(m.pendiente, 0) AS pendiente,
    COALESCE(m.pendiente_item, 0) AS pendiente_item,
    COALESCE(m.no_revisado, 0) AS no_revisado,
    COALESCE(m.rechazado, 0) AS rechazado,
    COALESCE(m.habilitado, 0) AS habilitado
  FROM scaffold s
  CROSS JOIN niveles n
  LEFT JOIN main_nivel m ON m.bloque = s.bloque AND m.nivel = n.n
),
otras_base AS (
  SELECT
    COALESCE(r.cantidad_total, 0)::numeric AS cq,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    public._dash_norm_item_key(r.item_numero) AS it,
    public._dash_norm_capitulo_key(r.capitulo) AS cap_k,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6,
    CASE
      WHEN upper(trim(COALESCE(r.capitulo, ''))) LIKE '14.%' OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '15.%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%ENSAYO%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%SONDEO%'
      THEN 'ensayos'
      ELSE 'obra'
    END AS bloque
  FROM public.vista_so_registros_matriz_validacion r
  WHERE r.contrato_id = p_contrato_id
    AND p_acta_id IS NOT NULL
    AND (r.acta_rpo_id IS NULL OR r.acta_rpo_id <> p_acta_id)
    AND public._dash_norm_item_key(r.item_numero) IS NOT NULL
),
otras_item AS (
  SELECT
    b.bloque,
    b.cap_k,
    b.it,
    nv.n AS nivel,
    MAX(b.vu) AS vu,
    SUM(CASE
      WHEN public._matriz_prereqs_ok(
             (SELECT na FROM cfg_min), nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6
           )
        AND public._matriz_estado_nivel(nv.n, b.n1, b.n2, b.n3, b.n4, b.n5, b.n6) = 'Pendiente'
      THEN b.cq ELSE 0
    END) AS q_otras
  FROM otras_base b
  CROSS JOIN niveles nv
  GROUP BY b.bloque, b.cap_k, b.it, nv.n
),
otras_nivel AS (
  SELECT
    bloque,
    nivel,
    SUM(public.dash_costo_agregado(q_otras, vu)) AS otras_actas
  FROM otras_item
  GROUP BY bloque, nivel
),
otras_full AS (
  SELECT
    s.bloque,
    n.n AS nivel,
    COALESCE(o.otras_actas, 0) AS otras_actas
  FROM scaffold s
  CROSS JOIN niveles n
  LEFT JOIN otras_nivel o ON o.bloque = s.bloque AND o.nivel = n.n
),
bloque_json AS (
  SELECT
    mf.bloque,
    jsonb_build_object(
      'aprobado', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.aprobado::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'pendiente', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.pendiente::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'pendiente_item', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.pendiente_item::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'no_revisado', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.no_revisado::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'rechazado', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.rechazado::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'habilitado', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.habilitado::numeric, 0))
         FROM main_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      ),
      'otras_actas', COALESCE(
        (SELECT jsonb_object_agg('nivel' || x.nivel::text, round(x.otras_actas::numeric, 0))
         FROM otras_full x WHERE x.bloque = mf.bloque),
        '{}'::jsonb
      )
    ) AS j
  FROM (SELECT DISTINCT bloque FROM main_full) mf
)
SELECT jsonb_build_object(
  'obra_ejecutada_directo_sin_aiu', (SELECT j FROM bloque_json WHERE bloque = 'obra'),
  'ensayos_sondeos_directo_sin_iva', (SELECT j FROM bloque_json WHERE bloque = 'ensayos')
);
$BODY$;

COMMENT ON FUNCTION public.dashboard_matriz_validacion_agg(bigint, bigint) IS
  'Matriz validación SICOE: acta filtrada por p_acta_id; cascada por niveles activos; claves nivel1..nivel6; pendiente_item en nivel{n_min}.';

-- Una sola llamada: resuelve acta RPO vigente en BD + agrega (evita 2 round-trips desde el API).
CREATE OR REPLACE FUNCTION public.dashboard_matriz_validacion_vigente_bundle(p_contrato_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $bundle$
DECLARE
  aid bigint;
  nr text;
  nom_asig text;
  mat jsonb;
BEGIN
  -- Mismo criterio que API acta RPO vigente: hoy ∈ [fecha_inicio, fecha_fin]; actas futuras no compiten.
  -- Si un día cae en dos períodos, gana fecha_inicio más reciente (transición natural al vencer el mes).
  SELECT
    a.id,
    a.numero_rpo::text,
    trim(both FROM coalesce(u.nombre, '') || ' ' || coalesce(u.apellidos, ''))
  INTO aid, nr, nom_asig
  FROM public.actas a
  LEFT JOIN public.usuarios u ON u.id = a.asignado_a
  WHERE a.contrato_id = p_contrato_id
    AND a.tipo_grupo = 'RPO'
    AND a.fecha_inicio <= CURRENT_DATE
    AND a.fecha_fin >= CURRENT_DATE
  ORDER BY a.fecha_inicio DESC, a.numero_rpo DESC NULLS LAST, a.id DESC
  LIMIT 1;

  mat := public.dashboard_matriz_validacion_agg(p_contrato_id, aid);

  RETURN jsonb_build_object(
    'obra_ejecutada_directo_sin_aiu', mat->'obra_ejecutada_directo_sin_aiu',
    'ensayos_sondeos_directo_sin_iva', mat->'ensayos_sondeos_directo_sin_iva',
    '_vigente', jsonb_build_object(
      'acta_id', to_jsonb(aid),
      'numero_rpo', CASE WHEN nr IS NULL OR nr = '' THEN NULL::jsonb ELSE to_jsonb(nr) END,
      'asignado_nombre', to_jsonb(CASE WHEN nom_asig IS NULL OR trim(nom_asig) = '' THEN NULL ELSE trim(nom_asig) END),
      'filtro', to_jsonb(
        CASE WHEN aid IS NULL THEN 'sin_vigente_todo_contrato'::text ELSE 'vigente'::text END
      )
    )
  );
END;
$bundle$;

COMMENT ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint) IS
  'Matriz validación: acta RPO en período (calendario; desempate en solape por fecha_inicio desc) + agregación.';

GRANT EXECUTE ON FUNCTION public._norm_estado_matriz(text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public._matriz_estado_nivel(smallint, text, text, text, text, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public._matriz_prereqs_ok(bigint[], smallint, text, text, text, text, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_agg(bigint, bigint) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint) TO authenticated, service_role, anon;
