-- Agregación en base de datos para /sicoe-obra/.../dashboard-matriz-validacion (rendimiento ~segundos).
-- Ejecutar en Supabase SQL Editor (o psql) una vez.
--
-- Patrón vista_dashboard_* (como vista_dashboard_resumen): exponer solo columnas que usa la matriz
-- para que el planificador lea menos ancho de fila y pueda usar índices de forma más eficiente.

CREATE OR REPLACE VIEW public.vista_so_registros_matriz_validacion AS
SELECT
  r.contrato_id,
  r.acta_rpo_id,
  r.capitulo,
  r.item_numero,
  r.costo_directo,
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
    COALESCE(r.costo_directo, 0)::numeric AS cd,
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
),
main AS (
  SELECT
    bloque,
    SUM(CASE WHEN n3 = 'Aprobado' THEN cd ELSE 0 END) AS aprobado_interventoria,
    SUM(CASE WHEN n2 = 'Aprobado' THEN cd ELSE 0 END) AS aprobado_residente,
    SUM(CASE WHEN n1 = 'Aprobado' THEN cd ELSE 0 END) AS aprobado_inspector,
    SUM(CASE WHEN n3 = 'Pendiente' THEN cd ELSE 0 END) AS pendiente_interventoria,
    SUM(CASE WHEN n2 = 'Pendiente' THEN cd ELSE 0 END) AS pendiente_residente,
    SUM(CASE WHEN n1 = 'Pendiente' THEN cd ELSE 0 END) AS pendiente_inspector,
    SUM(CASE WHEN sub_pend THEN cd ELSE 0 END) AS pendiente_item_residente,
    SUM(CASE WHEN n3 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cd ELSE 0 END) AS no_revisado_interventoria,
    SUM(CASE WHEN n2 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cd ELSE 0 END) AS no_revisado_residente,
    SUM(CASE WHEN n1 NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cd ELSE 0 END) AS no_revisado_inspector,
    SUM(CASE WHEN n3 = 'Rechazado' THEN cd ELSE 0 END) AS rechazado_interventoria,
    SUM(CASE WHEN n2 = 'Rechazado' THEN cd ELSE 0 END) AS rechazado_residente,
    SUM(CASE WHEN n1 = 'Rechazado' THEN cd ELSE 0 END) AS rechazado_inspector,
    SUM(cd) AS habilitado_inspector,
    SUM(CASE WHEN n1 = 'Aprobado' THEN cd ELSE 0 END) AS habilitado_residente,
    SUM(CASE WHEN n1 = 'Aprobado' AND n2 = 'Aprobado' THEN cd ELSE 0 END) AS habilitado_interventoria
  FROM base
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
otras AS (
  SELECT
    CASE
      WHEN upper(trim(COALESCE(r.capitulo, ''))) LIKE '14.%' OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '15.%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%ENSAYO%'
        OR upper(trim(COALESCE(r.capitulo, ''))) LIKE '%SONDEO%'
      THEN 'ensayos'
      ELSE 'obra'
    END AS bloque,
    SUM(CASE WHEN public._norm_estado_matriz(r.nivel3_estado) = 'Pendiente' THEN COALESCE(r.costo_directo, 0)::numeric ELSE 0 END) AS otras_interventoria,
    SUM(CASE WHEN public._norm_estado_matriz(r.nivel2_estado) = 'Pendiente' THEN COALESCE(r.costo_directo, 0)::numeric ELSE 0 END) AS otras_residente,
    SUM(CASE WHEN public._norm_estado_matriz(r.nivel1_estado) = 'Pendiente' THEN COALESCE(r.costo_directo, 0)::numeric ELSE 0 END) AS otras_inspector
  FROM public.vista_so_registros_matriz_validacion r
  WHERE r.contrato_id = p_contrato_id
    AND p_acta_id IS NOT NULL
    AND (r.acta_rpo_id IS NULL OR r.acta_rpo_id <> p_acta_id)
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
        'interventoria', round(m.aprobado_interventoria::numeric, 2),
        'residente', round(m.aprobado_residente::numeric, 2),
        'inspector', round(m.aprobado_inspector::numeric, 2)
      ),
      'pendiente', jsonb_build_object(
        'interventoria', round(m.pendiente_interventoria::numeric, 2),
        'residente', round(m.pendiente_residente::numeric, 2),
        'inspector', round(m.pendiente_inspector::numeric, 2)
      ),
      'pendiente_item', jsonb_build_object(
        'interventoria', 0,
        'residente', round(m.pendiente_item_residente::numeric, 2),
        'inspector', 0
      ),
      'no_revisado', jsonb_build_object(
        'interventoria', round(m.no_revisado_interventoria::numeric, 2),
        'residente', round(m.no_revisado_residente::numeric, 2),
        'inspector', round(m.no_revisado_inspector::numeric, 2)
      ),
      'rechazado', jsonb_build_object(
        'interventoria', round(m.rechazado_interventoria::numeric, 2),
        'residente', round(m.rechazado_residente::numeric, 2),
        'inspector', round(m.rechazado_inspector::numeric, 2)
      ),
      'habilitado', jsonb_build_object(
        'interventoria', round(m.habilitado_interventoria::numeric, 2),
        'residente', round(m.habilitado_residente::numeric, 2),
        'inspector', round(m.habilitado_inspector::numeric, 2)
      ),
      'otras_actas', jsonb_build_object(
        'interventoria', round(ot.otras_interventoria::numeric, 2),
        'residente', round(ot.otras_residente::numeric, 2),
        'inspector', round(ot.otras_inspector::numeric, 2)
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
  'Matriz validación SICOE: solo registros del acta cuando p_acta_id no es null.';

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
  -- Mismo criterio que GET /actas/.../lista (actas.asignado_a → usuarios)
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
  ORDER BY a.id DESC
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
  'Matriz validación: acta RPO vigente por período + agregación en una llamada.';

GRANT EXECUTE ON FUNCTION public._norm_estado_matriz(text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_agg(bigint, bigint) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint) TO authenticated, service_role, anon;
