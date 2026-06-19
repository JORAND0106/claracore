-- Agregación en base de datos para /sicoe-obra/.../dashboard-matriz-validacion (rendimiento ~segundos).
-- Ejecutar en Supabase SQL Editor (o psql) una vez.
--
-- Regla de negocio (cascada): N1 clasifica todo el acta; N2 solo filas con N1=Aprobado; N3 solo con N1 y N2=Aprobado.
-- Pendiente por ítem (sub_estado) solo con N1=Aprobado y va a la fila «pendiente_item», no al pendiente del inspector.
--
-- Patrón vista_dashboard_* (como vista_dashboard_resumen): exponer solo columnas que usa la matriz
-- para que el planificador lea menos ancho de fila y pueda usar índices de forma más eficiente.

CREATE OR REPLACE VIEW public.vista_so_registros_matriz_validacion
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

CREATE OR REPLACE FUNCTION public.dashboard_matriz_validacion_agg(p_contrato_id bigint, p_acta_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $BODY$
WITH scaffold AS (
  SELECT unnest(ARRAY['obra', 'ensayos']) AS bloque
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
    LOWER(TRIM(COALESCE(r.sub_estado, ''))) = 'pendiente' AS sub_pend,
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
item_buckets AS (
  SELECT
    bloque,
    cap_k,
    it,
    MAX(vu) AS vu,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'Aprobado' THEN cq ELSE 0 END) AS q_apr_int,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' THEN cq ELSE 0 END) AS q_apr_res,
    SUM(CASE WHEN n1 = 'Aprobado' THEN cq ELSE 0 END) AS q_apr_ins,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'Pendiente' THEN cq ELSE 0 END) AS q_pend_int,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Pendiente' THEN cq ELSE 0 END) AS q_pend_res,
    SUM(CASE WHEN n1 = 'Pendiente' THEN cq ELSE 0 END) AS q_pend_ins,
    SUM(CASE WHEN sub_pend AND n1 = 'Aprobado' THEN cq ELSE 0 END) AS q_pend_item_res,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cq ELSE 0 END) AS q_nr_int,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cq ELSE 0 END) AS q_nr_res,
    SUM(CASE WHEN n1 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cq ELSE 0 END) AS q_nr_ins,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'Rechazado' THEN cq ELSE 0 END) AS q_rej_int,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Rechazado' THEN cq ELSE 0 END) AS q_rej_res,
    SUM(CASE WHEN n1 = 'Rechazado' THEN cq ELSE 0 END) AS q_rej_ins,
    SUM(cq) AS q_hab_ins,
    SUM(CASE WHEN n1 = 'Aprobado' THEN cq ELSE 0 END) AS q_hab_res,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' THEN cq ELSE 0 END) AS q_hab_int
  FROM base
  GROUP BY bloque, cap_k, it
),
main AS (
  SELECT
    bloque,
    SUM(public.dash_costo_agregado(q_apr_int, vu)) AS aprobado_interventoria,
    SUM(public.dash_costo_agregado(q_apr_res, vu)) AS aprobado_residente,
    SUM(public.dash_costo_agregado(q_apr_ins, vu)) AS aprobado_inspector,
    SUM(public.dash_costo_agregado(q_pend_int, vu)) AS pendiente_interventoria,
    SUM(public.dash_costo_agregado(q_pend_res, vu)) AS pendiente_residente,
    SUM(public.dash_costo_agregado(q_pend_ins, vu)) AS pendiente_inspector,
    SUM(public.dash_costo_agregado(q_pend_item_res, vu)) AS pendiente_item_residente,
    SUM(public.dash_costo_agregado(q_nr_int, vu)) AS no_revisado_interventoria,
    SUM(public.dash_costo_agregado(q_nr_res, vu)) AS no_revisado_residente,
    SUM(public.dash_costo_agregado(q_nr_ins, vu)) AS no_revisado_inspector,
    SUM(public.dash_costo_agregado(q_rej_int, vu)) AS rechazado_interventoria,
    SUM(public.dash_costo_agregado(q_rej_res, vu)) AS rechazado_residente,
    SUM(public.dash_costo_agregado(q_rej_ins, vu)) AS rechazado_inspector,
    SUM(public.dash_costo_agregado(q_hab_ins, vu)) AS habilitado_inspector,
    SUM(public.dash_costo_agregado(q_hab_res, vu)) AS habilitado_residente,
    SUM(public.dash_costo_agregado(q_hab_int, vu)) AS habilitado_interventoria
  FROM item_buckets
  GROUP BY bloque
),
main_full AS (
  SELECT
    s.bloque,
    COALESCE(m.aprobado_interventoria, 0) AS aprobado_interventoria,
    COALESCE(m.aprobado_residente, 0) AS aprobado_residente,
    COALESCE(m.aprobado_inspector, 0) AS aprobado_inspector,
    COALESCE(m.pendiente_interventoria, 0) AS pendiente_interventoria,
    COALESCE(m.pendiente_residente, 0) AS pendiente_residente,
    COALESCE(m.pendiente_inspector, 0) AS pendiente_inspector,
    COALESCE(m.pendiente_item_residente, 0) AS pendiente_item_residente,
    COALESCE(m.no_revisado_interventoria, 0) AS no_revisado_interventoria,
    COALESCE(m.no_revisado_residente, 0) AS no_revisado_residente,
    COALESCE(m.no_revisado_inspector, 0) AS no_revisado_inspector,
    COALESCE(m.rechazado_interventoria, 0) AS rechazado_interventoria,
    COALESCE(m.rechazado_residente, 0) AS rechazado_residente,
    COALESCE(m.rechazado_inspector, 0) AS rechazado_inspector,
    COALESCE(m.habilitado_inspector, 0) AS habilitado_inspector,
    COALESCE(m.habilitado_residente, 0) AS habilitado_residente,
    COALESCE(m.habilitado_interventoria, 0) AS habilitado_interventoria
  FROM scaffold s
  LEFT JOIN main m ON m.bloque = s.bloque
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
    bloque,
    cap_k,
    it,
    MAX(vu) AS vu,
    SUM(CASE
      WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'Pendiente' THEN cq ELSE 0 END) AS q_int,
    SUM(CASE
      WHEN n1 = 'Aprobado' AND n2 = 'Pendiente' THEN cq ELSE 0 END) AS q_res,
    SUM(CASE WHEN n1 = 'Pendiente' THEN cq ELSE 0 END) AS q_ins
  FROM otras_base
  GROUP BY bloque, cap_k, it
),
otras AS (
  SELECT
    bloque,
    SUM(public.dash_costo_agregado(q_int, vu)) AS otras_interventoria,
    SUM(public.dash_costo_agregado(q_res, vu)) AS otras_residente,
    SUM(public.dash_costo_agregado(q_ins, vu)) AS otras_inspector
  FROM otras_item
  GROUP BY 1
),
otras_full AS (
  SELECT s.bloque,
    COALESCE(o.otras_interventoria, 0) AS otras_interventoria,
    COALESCE(o.otras_residente, 0) AS otras_residente,
    COALESCE(o.otras_inspector, 0) AS otras_inspector
  FROM scaffold s
  LEFT JOIN otras o ON o.bloque = s.bloque
),
bloque_json AS (
  SELECT
    m.bloque,
    jsonb_build_object(
      'aprobado', jsonb_build_object(
        'interventoria', round(m.aprobado_interventoria::numeric, 0),
        'residente', round(m.aprobado_residente::numeric, 0),
        'inspector', round(m.aprobado_inspector::numeric, 0)
      ),
      'pendiente', jsonb_build_object(
        'interventoria', round(m.pendiente_interventoria::numeric, 0),
        'residente', round(m.pendiente_residente::numeric, 0),
        'inspector', round(m.pendiente_inspector::numeric, 0)
      ),
      'pendiente_item', jsonb_build_object(
        'interventoria', 0,
        'residente', round(m.pendiente_item_residente::numeric, 0),
        'inspector', 0
      ),
      'no_revisado', jsonb_build_object(
        'interventoria', round(m.no_revisado_interventoria::numeric, 0),
        'residente', round(m.no_revisado_residente::numeric, 0),
        'inspector', round(m.no_revisado_inspector::numeric, 0)
      ),
      'rechazado', jsonb_build_object(
        'interventoria', round(m.rechazado_interventoria::numeric, 0),
        'residente', round(m.rechazado_residente::numeric, 0),
        'inspector', round(m.rechazado_inspector::numeric, 0)
      ),
      'habilitado', jsonb_build_object(
        'interventoria', round(m.habilitado_interventoria::numeric, 0),
        'residente', round(m.habilitado_residente::numeric, 0),
        'inspector', round(m.habilitado_inspector::numeric, 0)
      ),
      'otras_actas', jsonb_build_object(
        'interventoria', round(ot.otras_interventoria::numeric, 0),
        'residente', round(ot.otras_residente::numeric, 0),
        'inspector', round(ot.otras_inspector::numeric, 0)
      )
    ) AS j
  FROM main_full m
  JOIN otras_full ot ON ot.bloque = m.bloque
)
SELECT jsonb_build_object(
  'obra_ejecutada_directo_sin_aiu', (SELECT j FROM bloque_json WHERE bloque = 'obra'),
  'ensayos_sondeos_directo_sin_iva', (SELECT j FROM bloque_json WHERE bloque = 'ensayos')
);
$BODY$;

COMMENT ON FUNCTION public.dashboard_matriz_validacion_agg(bigint, bigint) IS
  'Matriz validación SICOE: acta filtrada por p_acta_id; N2/N3 en cascada (N2 solo si N1 aprobado; N3 solo si N1 y N2 aprobados).';

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
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_agg(bigint, bigint) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint) TO authenticated, service_role, anon;
