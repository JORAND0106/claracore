-- Idempotente. Ejecutar en Supabase si ya aplicó migration_prog_obra_fase1.sql con la versión antigua de prog_mapa_pk_estados.
-- /mapa: todos los PK en pk_ids; estado desde prog_pk_estado (versión vigente) o fallback presupuesto (sin_iniciar / sin_cantidad).

CREATE OR REPLACE FUNCTION public.prog_mapa_pk_estados(p_contrato_id bigint)
RETURNS TABLE (
  pk_id varchar,
  estado_programacion text,
  items_total integer,
  items_con_fecha integer,
  porcentaje_programado numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH pks AS (
    SELECT DISTINCT trim(pki.pk_id::text) AS pk_id
    FROM public.pk_ids pki
    WHERE pki.contrato_id = p_contrato_id
      AND trim(pki.pk_id::text) <> ''
  ),
  estado_v AS (
    SELECT trim(e.pk_id::text) AS pk_id,
           e.estado_programacion::text AS estado_programacion,
           e.items_total::integer AS items_total,
           e.items_con_fecha::integer AS items_con_fecha,
           e.porcentaje_programado::numeric AS porcentaje_programado
    FROM public.prog_pk_estado e
    INNER JOIN public.contratos c
      ON c.id = p_contrato_id
     AND c.id = e.contrato_id
     AND c.prog_version_vigente_id IS NOT NULL
     AND e.version_id = c.prog_version_vigente_id
  ),
  ppto_items AS (
    SELECT d.pk_id, count(*)::integer AS n_items
    FROM (
      SELECT DISTINCT
        trim(p.pk_id::text) AS pk_id,
        trim(p.capitulo::text) AS capitulo,
        trim(p.item::text) AS item
      FROM public.presupuesto p
      WHERE p.contrato_id = p_contrato_id
        AND trim(coalesce(p.tipo_ejecucion::text, '')) = 'Presupuesto de Obra'
        AND coalesce(p.dado_de_baja, false) = false
        AND trim(coalesce(p.pk_id::text, '')) <> ''
        AND trim(coalesce(p.capitulo::text, '')) <> ''
        AND trim(coalesce(p.item::text, '')) <> ''
    ) d
    GROUP BY d.pk_id
  )
  SELECT
    p.pk_id::varchar,
    coalesce(
      ev.estado_programacion,
      CASE WHEN coalesce(pi.n_items, 0) > 0 THEN 'sin_iniciar' ELSE 'sin_cantidad' END
    )::text AS estado_programacion,
    coalesce(ev.items_total, coalesce(pi.n_items, 0))::integer AS items_total,
    coalesce(ev.items_con_fecha, 0)::integer AS items_con_fecha,
    CASE
      WHEN ev.estado_programacion IS NOT NULL THEN ev.porcentaje_programado
      WHEN coalesce(pi.n_items, 0) = 0 THEN NULL::numeric
      ELSE 0::numeric
    END AS porcentaje_programado
  FROM pks p
  LEFT JOIN estado_v ev ON ev.pk_id = p.pk_id
  LEFT JOIN ppto_items pi ON pi.pk_id = p.pk_id;
$$;

COMMENT ON FUNCTION public.prog_mapa_pk_estados(bigint) IS
  'Mapa: por PK del contrato (pk_ids), estado desde prog_pk_estado de la versión vigente sellada; si no hay fila, sin_iniciar/sin_cantidad según presupuesto «Presupuesto de Obra» activo.';
