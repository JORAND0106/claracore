-- Dashboard drill: agregación en BD (reemplaza bucles Python en /dashboard-drill y /dashboard-pkid-tabla).
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql).
-- Ejecutar en Supabase SQL Editor tras revisar nombres de vista / columnas.

CREATE OR REPLACE FUNCTION public._dash_norm_item_key(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(btrim(COALESCE(txt, '')), '\.+$', ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public._dash_norm_capitulo(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN txt IS NULL OR btrim(txt) = '' THEN 'Sin capítulo'
    ELSE btrim(txt)
  END;
$$;

-- Comparación estable capítulo obra vs presupuesto: colapsa espacios y quita espacio tras «4. ».
CREATE OR REPLACE FUNCTION public._dash_norm_capitulo_key(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN txt IS NULL OR btrim(txt) = '' THEN 'Sin capítulo'
    ELSE regexp_replace(
      regexp_replace(btrim(txt), '\s+', ' ', 'g'),
      '^(\d+\.)\s+',
      '\1',
      ''
    )
  END;
$$;

-- Listado por capítulo (nivel 1 drill).
CREATE OR REPLACE FUNCTION public.dashboard_drill_capitulos_agg(p_contrato_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
regs AS (
  SELECT
    public._dash_norm_capitulo(r.capitulo) AS cap,
    r.costo_directo::numeric AS cd,
    r.cantidad_total::numeric AS cq,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    COALESCE(public._dash_norm_item_key(r.item_numero), '') <> '' AS has_item
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
),
obra AS (
  SELECT
    cap,
    SUM(cd) FILTER (WHERE n3 = 'Aprobado') AS ap_c,
    SUM(cq) FILTER (WHERE n3 = 'Aprobado') AS ap_q,
    SUM(cd) FILTER (
      WHERE has_item AND n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'No Revisado'
    ) AS nr_c,
    SUM(cq) FILTER (
      WHERE has_item AND n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'No Revisado'
    ) AS nr_q
  FROM regs
  GROUP BY cap
),
ppto_tot AS (
  SELECT public._dash_norm_capitulo(v.capitulo) AS cap, SUM(COALESCE(v.presupuesto, 0)::numeric) AS pres
  FROM public.vista_ppto_por_capitulo v
  WHERE v.contrato_id = p_contrato_id
  GROUP BY 1
),
ppto_split AS (
  SELECT
    public._dash_norm_capitulo(p.capitulo) AS cap,
    SUM(
      CASE WHEN public._norm_estado_matriz(p.revisado) = 'Aprobado' THEN COALESCE(p.costo_directo, 0)::numeric ELSE 0 END
    ) AS pap,
    SUM(
      CASE WHEN public._norm_estado_matriz(p.revisado) <> 'Aprobado' THEN COALESCE(p.costo_directo, 0)::numeric ELSE 0 END
    ) AS pnr
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
  GROUP BY 1
),
all_caps AS (
  SELECT v.cap
  FROM ppto_tot v
  UNION
  SELECT o.cap FROM obra o
  UNION
  SELECT s.cap FROM ppto_split s
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'nombre', c.cap,
      'descripcion', '',
      'presupuesto', round(COALESCE(pt.pres, 0), 2),
      'cobrado', round(COALESCE(ob.ap_c, 0), 2),
      'presupuesto_aprobado_n3', round(COALESCE(ps.pap, 0), 2),
      'presupuesto_no_revisado_n3', round(COALESCE(ps.pnr, 0), 2),
      'sicoe_no_revisado_n3', round(COALESCE(ob.nr_c, 0), 2),
      'delta', round(COALESCE(pt.pres, 0) - COALESCE(ob.ap_c, 0), 2),
      'pct',
      CASE
        WHEN COALESCE(pt.pres, 0) > 0 THEN round(COALESCE(ob.ap_c, 0) / pt.pres * 100, 1)
        ELSE 0
      END,
      'cant_ppto', 0,
      'cant_sicoe_aprobado', round(COALESCE(ob.ap_q, 0), 3),
      'cant_sicoe_no_revisado', round(COALESCE(ob.nr_q, 0), 3)
    )
    ORDER BY c.cap
  ),
  '[]'::jsonb
)
FROM all_caps c
LEFT JOIN obra ob ON ob.cap = c.cap
LEFT JOIN ppto_tot pt ON pt.cap = c.cap
LEFT JOIN ppto_split ps ON ps.cap = c.cap;
$f$;

-- Ítems dentro de un capítulo (nivel 1 → lista de barras).
CREATE OR REPLACE FUNCTION public.dashboard_drill_items_agg(p_contrato_id bigint, p_capitulo text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
cm AS (SELECT public._dash_norm_capitulo_key(p_capitulo) AS cap),
ppto AS (
  SELECT
    public._dash_norm_item_key(p.item) AS it,
    SUM(COALESCE(p.costo_directo, 0)::numeric) AS p_cost,
    SUM(COALESCE(p.cant_total, 0)::numeric) AS p_cant,
    SUM(
      CASE WHEN public._norm_estado_matriz(p.revisado) = 'Aprobado' THEN COALESCE(p.costo_directo, 0)::numeric ELSE 0 END
    ) AS pap,
    SUM(
      CASE WHEN public._norm_estado_matriz(p.revisado) <> 'Aprobado' THEN COALESCE(p.costo_directo, 0)::numeric ELSE 0 END
    ) AS pnr,
    MAX(CASE WHEN p.descripcion IS NOT NULL AND btrim(p.descripcion::text) <> '' THEN p.descripcion::text END) AS descripcion
  FROM public.presupuesto p, cm
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_capitulo_key(p.capitulo) = cm.cap
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1
),
regs AS (
  SELECT
    public._dash_norm_item_key(r.item_numero) AS it,
    r.costo_directo::numeric AS cd,
    r.cantidad_total::numeric AS cq,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2
  FROM public.so_registros r, cm
  WHERE r.contrato_id = p_contrato_id
    AND public._dash_norm_capitulo_key(r.capitulo) = cm.cap
),
obra AS (
  SELECT
    it,
    SUM(cd) FILTER (WHERE it IS NOT NULL AND n3 = 'Aprobado') AS ap_c,
    SUM(cq) FILTER (WHERE it IS NOT NULL AND n3 = 'Aprobado') AS ap_q,
    SUM(cd) FILTER (
      WHERE it IS NOT NULL AND n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'No Revisado'
    ) AS nr_c,
    SUM(cq) FILTER (
      WHERE it IS NOT NULL AND n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 = 'No Revisado'
    ) AS nr_q
  FROM regs
  WHERE it IS NOT NULL
  GROUP BY it
),
all_items AS (
  SELECT it FROM ppto
  UNION
  SELECT it FROM obra WHERE it IS NOT NULL
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'item', ai.it,
      'nombre', ai.it,
      'descripcion', COALESCE(pt.descripcion, ''),
      'presupuesto', round(COALESCE(pt.p_cost, 0), 2),
      'cobrado', round(COALESCE(ob.ap_c, 0), 2),
      'presupuesto_aprobado_n3', round(COALESCE(pt.pap, 0), 2),
      'presupuesto_no_revisado_n3', round(COALESCE(pt.pnr, 0), 2),
      'sicoe_no_revisado_n3', round(COALESCE(ob.nr_c, 0), 2),
      'delta', round(COALESCE(pt.p_cost, 0) - COALESCE(ob.ap_c, 0), 2),
      'pct',
      CASE
        WHEN COALESCE(pt.p_cost, 0) > 0 THEN round(COALESCE(ob.ap_c, 0) / pt.p_cost * 100, 1)
        ELSE 0
      END,
      'cant_ppto', round(COALESCE(pt.p_cant, 0), 3),
      'cant_sicoe_aprobado', round(COALESCE(ob.ap_q, 0), 3),
      'cant_sicoe_no_revisado', round(COALESCE(ob.nr_q, 0), 3)
    )
    ORDER BY ai.it
  ),
  '[]'::jsonb
)
FROM all_items ai
LEFT JOIN ppto pt ON pt.it = ai.it
LEFT JOIN obra ob ON ob.it = ai.it;
$f$;

-- Tabla PK_ID para un capítulo + ítem (nivel 2 drill). Usa la misma clave de ítem normalizada.
CREATE OR REPLACE FUNCTION public.dashboard_pkid_tabla_agg(
  p_contrato_id bigint,
  p_capitulo text,
  p_item text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
cm AS (SELECT public._dash_norm_capitulo_key(p_capitulo) AS cap),
pk_line AS (
  SELECT
    COALESCE(NULLIF(btrim(p.pk_id::text), ''), '(sin pk)') AS pk_disp,
    p.cant_total::numeric AS cq,
    p.costo_directo::numeric AS cd,
    public._norm_estado_matriz(p.revisado) AS rev_n,
    p.revisado,
    p.descripcion
  FROM public.presupuesto p, cm
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_capitulo_key(p.capitulo) = cm.cap
    AND (
      NULLIF(btrim(COALESCE(p_item, '')), '') IS NULL
      OR public._dash_norm_item_key(p.item) = public._dash_norm_item_key(p_item)
    )
),
pk_ppto AS (
  SELECT
    pk_disp,
    SUM(cq) FILTER (WHERE rev_n = 'Aprobado') AS p_ap_q,
    SUM(cd) FILTER (WHERE rev_n = 'Aprobado') AS p_ap_c,
    SUM(cq) FILTER (WHERE rev_n = 'Pendiente') AS p_pd_q,
    SUM(cd) FILTER (WHERE rev_n = 'Pendiente') AS p_pd_c,
    SUM(cq) FILTER (WHERE rev_n = 'Rechazado') AS p_rj_q,
    SUM(cd) FILTER (WHERE rev_n = 'Rechazado') AS p_rj_c,
    SUM(cq) FILTER (
      WHERE rev_n IS DISTINCT FROM 'Aprobado'
        AND rev_n IS DISTINCT FROM 'Pendiente'
        AND rev_n IS DISTINCT FROM 'Rechazado'
    ) AS p_nr_q,
    SUM(cd) FILTER (
      WHERE rev_n IS DISTINCT FROM 'Aprobado'
        AND rev_n IS DISTINCT FROM 'Pendiente'
        AND rev_n IS DISTINCT FROM 'Rechazado'
    ) AS p_nr_c,
    MAX(CASE WHEN descripcion IS NOT NULL AND btrim(descripcion::text) <> '' THEN descripcion::text END) AS descl
  FROM pk_line
  GROUP BY pk_disp
),
-- Revisado dominante: el de la línea de mayor costo (igual que Python).
pk_rev AS (
  SELECT pk_disp, public._norm_estado_matriz(revisado) AS rev_dom
  FROM (
    SELECT
      pk_disp,
      revisado,
      cd,
      row_number() OVER (PARTITION BY pk_disp ORDER BY cd DESC NULLS LAST) AS rn
    FROM pk_line
  ) s
  WHERE rn = 1
),
regs AS (
  SELECT
    COALESCE(NULLIF(btrim(pk.pk_id::text), ''), '(sin pk)') AS pk_disp,
    r.costo_directo::numeric AS cd,
    r.cantidad_total::numeric AS cq,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2
  FROM public.so_registros r
  LEFT JOIN public.pk_ids pk ON pk.id = r.pk_id_id AND pk.contrato_id = r.contrato_id, cm
  WHERE r.contrato_id = p_contrato_id
    AND public._dash_norm_capitulo_key(r.capitulo) = cm.cap
    AND (
      NULLIF(btrim(COALESCE(p_item, '')), '') IS NULL
      OR public._dash_norm_item_key(r.item_numero) = public._dash_norm_item_key(p_item)
    )
),
cola AS (
  SELECT
    *,
    (n1 = 'Aprobado' AND n2 = 'Aprobado' AND n3 IS DISTINCT FROM 'Aprobado') AS in_cola
  FROM regs
),
obra_pk AS (
  SELECT
    pk_disp,
    SUM(cd) FILTER (WHERE n3 = 'Aprobado') AS ap_c,
    SUM(cq) FILTER (WHERE n3 = 'Aprobado') AS ap_q,
    SUM(cd) FILTER (WHERE in_cola AND n3 = 'Pendiente') AS pe_c,
    SUM(cq) FILTER (WHERE in_cola AND n3 = 'Pendiente') AS pe_q,
    SUM(cd) FILTER (WHERE in_cola AND n3 = 'Rechazado') AS rej_c,
    SUM(cq) FILTER (WHERE in_cola AND n3 = 'Rechazado') AS rej_q,
    SUM(cd) FILTER (
      WHERE in_cola AND n3 IS DISTINCT FROM 'Pendiente' AND n3 IS DISTINCT FROM 'Rechazado'
    ) AS nr_c,
    SUM(cq) FILTER (
      WHERE in_cola AND n3 IS DISTINCT FROM 'Pendiente' AND n3 IS DISTINCT FROM 'Rechazado'
    ) AS nr_q
  FROM cola
  GROUP BY pk_disp
),
keys AS (
  SELECT pk_disp FROM pk_ppto
  UNION
  SELECT pk_disp FROM obra_pk
),
out_rows AS (
  SELECT
    k.pk_disp AS pk_id,
    round(
      COALESCE(pp.p_ap_q, 0) + COALESCE(pp.p_nr_q, 0) + COALESCE(pp.p_pd_q, 0) + COALESCE(pp.p_rj_q, 0),
      2
    ) AS cant_ppto,
    round(
      COALESCE(pp.p_ap_c, 0) + COALESCE(pp.p_nr_c, 0) + COALESCE(pp.p_pd_c, 0) + COALESCE(pp.p_rj_c, 0),
      0
    ) AS costo_ppto,
    round(COALESCE(pp.p_ap_q, 0), 2) AS cant_ppto_aprobado_n3,
    round(COALESCE(pp.p_ap_c, 0), 0) AS costo_ppto_aprobado_n3,
    round(COALESCE(pp.p_nr_q, 0), 2) AS cant_ppto_estado_no_revisado,
    round(COALESCE(pp.p_nr_c, 0), 0) AS costo_ppto_estado_no_revisado,
    round(COALESCE(pp.p_pd_q, 0), 2) AS cant_ppto_estado_pendiente,
    round(COALESCE(pp.p_pd_c, 0), 0) AS costo_ppto_estado_pendiente,
    round(COALESCE(pp.p_rj_q, 0), 2) AS cant_ppto_estado_rechazado,
    round(COALESCE(pp.p_rj_c, 0), 0) AS costo_ppto_estado_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe_aprobado,
    round(COALESCE(o.ap_c, 0), 0) AS costo_sicoe_aprobado,
    round(COALESCE(o.nr_q, 0), 2) AS cant_sicoe_no_revisado,
    round(COALESCE(o.nr_c, 0), 0) AS costo_sicoe_no_revisado,
    round(COALESCE(o.pe_q, 0), 2) AS cant_sicoe_pendiente,
    round(COALESCE(o.pe_c, 0), 0) AS costo_sicoe_pendiente,
    round(COALESCE(o.rej_q, 0), 2) AS cant_sicoe_rechazado,
    round(COALESCE(o.rej_c, 0), 0) AS costo_sicoe_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe,
    round(COALESCE(o.ap_c, 0), 0) AS costo_sicoe,
    0.0::numeric AS cant_facturado,
    0.0::numeric AS costo_facturado,
    round(COALESCE(pp.p_ap_q, 0) - COALESCE(o.ap_q, 0), 2) AS delta_cant,
    round(COALESCE(pp.p_ap_c, 0) - COALESCE(o.ap_c, 0), 0) AS delta_costo,
    COALESCE(pp.descl, '') AS descripcion,
    COALESCE(rv.rev_dom::text, 'No Revisado') AS revisado
  FROM keys k
  LEFT JOIN pk_ppto pp ON pp.pk_disp = k.pk_disp
  LEFT JOIN obra_pk o ON o.pk_disp = k.pk_disp
  LEFT JOIN pk_rev rv ON rv.pk_disp = k.pk_disp
),
tot AS (
  SELECT
    COALESCE(
      SUM(delta_costo) FILTER (WHERE delta_costo > 0),
      0::numeric
    ) AS por_cobrar,
    COALESCE(
      SUM(abs(delta_costo)) FILTER (WHERE delta_costo < 0),
      0::numeric
    ) AS devolucion
  FROM out_rows
),
di AS (
  SELECT MAX(p.descripcion::text) AS descripcion_item
  FROM public.presupuesto p, cm
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_capitulo_key(p.capitulo) = cm.cap
    AND NULLIF(btrim(COALESCE(p_item, '')), '') IS NOT NULL
    AND public._dash_norm_item_key(p.item) = public._dash_norm_item_key(p_item)
    AND p.descripcion IS NOT NULL
)
SELECT jsonb_build_object(
  'rows', COALESCE((SELECT jsonb_agg(to_jsonb(x.*) ORDER BY x.pk_id) FROM out_rows x), '[]'::jsonb),
  'por_cobrar', (SELECT por_cobrar FROM tot),
  'devolucion', (SELECT devolucion FROM tot),
  'descripcion_item', COALESCE((SELECT descripcion_item FROM di), '')
);
$f$;

COMMENT ON FUNCTION public.dashboard_drill_capitulos_agg(bigint) IS
  'Dashboard drill nivel capítulos: una pasada en BD.';
COMMENT ON FUNCTION public.dashboard_drill_items_agg(bigint, text) IS
  'Dashboard drill ítems por capítulo: una pasada en BD.';
COMMENT ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text) IS
  'Tabla PK_ID: cola obra = N1+N2 aprobados y N3 no aprobado. cant_sicoe_no_revisado = solo tramos N3 «no revisado» u otros (no pendiente ni rechazado); pendiente/rechazado en sus columnas.';

GRANT EXECUTE ON FUNCTION public._dash_norm_item_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_capitulos_agg(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_items_agg(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text) TO authenticated, service_role;
