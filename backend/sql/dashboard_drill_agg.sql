-- Dashboard drill: agregación en BD (reemplaza bucles Python en /dashboard-drill y /dashboard-pkid-tabla).
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql).
-- Ejecutar en Supabase SQL Editor tras revisar nombres de vista / columnas.
--
-- Quitar firmas antiguas (solo p_contrato_id / sin nivel máximo); si no, coexisten sobrecargas
-- y PostgREST puede seguir llamando la versión equivocada.
DROP FUNCTION IF EXISTS public.dashboard_drill_capitulos_agg(bigint);
DROP FUNCTION IF EXISTS public.dashboard_drill_capitulos_agg(bigint, text);
DROP FUNCTION IF EXISTS public.dashboard_drill_items_agg(bigint, text);
DROP FUNCTION IF EXISTS public.dashboard_drill_items_agg(bigint, text, text);
DROP FUNCTION IF EXISTS public.dashboard_pkid_tabla_agg(bigint, text, text);
DROP FUNCTION IF EXISTS public.dashboard_pkid_tabla_agg(bigint, text, text, text);

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

-- Estado normalizado del nivel final del contrato (p_campo = 'nivel3_estado' … 'nivel6_estado').
CREATE OR REPLACE FUNCTION public._dash_matriz_nivel_max_estado(
  p_campo text,
  n1 text, n2 text, n3 text, n4 text, n5 text, n6 text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public._norm_estado_matriz(
    CASE lower(btrim(COALESCE(p_campo, 'nivel3_estado')))
      WHEN 'nivel1_estado' THEN n1
      WHEN 'nivel2_estado' THEN n2
      WHEN 'nivel3_estado' THEN n3
      WHEN 'nivel4_estado' THEN n4
      WHEN 'nivel5_estado' THEN n5
      WHEN 'nivel6_estado' THEN n6
      ELSE n3
    END
  );
$$;

-- Número de nivel 1..6 a partir del nombre de columna estado (p. ej. nivel4_estado → 4).
CREATE OR REPLACE FUNCTION public._dash_nivel_num_desde_campo(p_campo text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(p_campo, 'nivel3_estado')))
    WHEN 'nivel1_estado' THEN 1::smallint
    WHEN 'nivel2_estado' THEN 2::smallint
    WHEN 'nivel3_estado' THEN 3::smallint
    WHEN 'nivel4_estado' THEN 4::smallint
    WHEN 'nivel5_estado' THEN 5::smallint
    WHEN 'nivel6_estado' THEN 6::smallint
    ELSE 3::smallint
  END;
$$;

-- Todos los niveles listados en p_niveles_activos y estrictamente menores a p_max_n deben estar «Aprobado»
-- (estados n1..n6 ya normalizados con _norm_estado_matriz). Ej. activos {1,2,4}, max 4 → exige N1 y N2.
CREATE OR REPLACE FUNCTION public._dash_prereqs_activos_aprobados_norm(
  p_niveles_activos bigint[],
  p_max_n smallint,
  n1 text, n2 text, n3 text, n4 text, n5 text, n6 text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    bool_and(
      CASE u.lvl::smallint
        WHEN 1::smallint THEN n1 = 'Aprobado'
        WHEN 2::smallint THEN n2 = 'Aprobado'
        WHEN 3::smallint THEN n3 = 'Aprobado'
        WHEN 4::smallint THEN n4 = 'Aprobado'
        WHEN 5::smallint THEN n5 = 'Aprobado'
        WHEN 6::smallint THEN n6 = 'Aprobado'
        ELSE true
      END
    ),
    true
  )
  FROM unnest(COALESCE(p_niveles_activos, ARRAY[1, 2, 3]::bigint[])) AS u(lvl)
  WHERE u.lvl IS NOT NULL AND u.lvl::smallint < p_max_n;
$$;

-- Listado por capítulo (nivel 1 drill).
CREATE OR REPLACE FUNCTION public.dashboard_drill_capitulos_agg(
  p_contrato_id bigint,
  p_campo_nivel_max text DEFAULT 'nivel3_estado',
  p_niveles_activos bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
regs AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capítulo'
        ELSE r.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(r.item_numero) AS it,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    r.cantidad_total::numeric AS cq,
    public._dash_matriz_nivel_max_estado(
      p_campo_nivel_max,
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6,
    COALESCE(public._dash_norm_item_key(r.item_numero), '') <> '' AS has_item
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
),
sicoe_item AS (
  SELECT
    cap,
    it,
    MAX(vu) AS vu,
    SUM(cq) FILTER (WHERE nmax = 'Aprobado') AS ap_q,
    SUM(cq) FILTER (
      WHERE has_item
        AND public._dash_prereqs_activos_aprobados_norm(
          p_niveles_activos,
          public._dash_nivel_num_desde_campo(p_campo_nivel_max),
          n1, n2, n3, n4, n5, n6
        )
        AND nmax = 'No Revisado'
    ) AS nr_q
  FROM regs
  WHERE it IS NOT NULL
  GROUP BY cap, it
),
obra AS (
  SELECT
    cap,
    SUM(public.dash_costo_agregado(ap_q, vu)) AS ap_c,
    SUM(ap_q) AS ap_q,
    SUM(public.dash_costo_agregado(nr_q, vu)) AS nr_c,
    SUM(nr_q) AS nr_q
  FROM sicoe_item
  GROUP BY cap
),
ppto_items AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN p.capitulo IS NULL OR btrim(p.capitulo::text) = '' THEN 'Sin capítulo'
        ELSE p.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(p.item) AS it,
    MAX(COALESCE(p.vlr_unitario, 0)::numeric) AS vu,
    SUM(CASE WHEN public._norm_estado_matriz(p.revisado) = 'Aprobado' THEN COALESCE(p.cant_total, 0)::numeric ELSE 0 END) AS cant_ap,
    SUM(CASE WHEN public._norm_estado_matriz(p.revisado) <> 'Aprobado' THEN COALESCE(p.cant_total, 0)::numeric ELSE 0 END) AS cant_nr
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1, 2
),
ppto_split AS (
  SELECT
    cap,
    SUM(public.dash_costo_agregado(cant_ap, vu)) AS pap,
    SUM(public.dash_costo_agregado(cant_nr, vu)) AS pnr,
    SUM(public.dash_costo_agregado(cant_ap + cant_nr, vu)) AS pres
  FROM ppto_items
  GROUP BY cap
),
all_caps AS (
  SELECT cap FROM ppto_split
  UNION
  SELECT o.cap FROM obra o
)
-- Sub-SELECT: si all_caps está vacío, jsonb_agg sobre 0 filas devuelve NULL en una fila → COALESCE → '[]'.
-- Sin este envoltorio, FROM vacío hace que la función no devuelva fila y PostgREST recibe NULL (ítems no cargan).
SELECT COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'nombre', c.cap,
        'descripcion', '',
        'presupuesto', round(COALESCE(ps.pres, 0), 0),
        'cobrado', round(COALESCE(ob.ap_c, 0), 0),
        'presupuesto_aprobado_n3', round(COALESCE(ps.pap, 0), 0),
        'presupuesto_no_revisado_n3', round(COALESCE(ps.pnr, 0), 0),
        'sicoe_no_revisado_n3', round(COALESCE(ob.nr_c, 0), 0),
        'delta', round(COALESCE(ps.pres, 0) - COALESCE(ob.ap_c, 0), 0),
        'pct',
        CASE
          WHEN COALESCE(ps.pres, 0) > 0 THEN round(COALESCE(ob.ap_c, 0) / ps.pres * 100, 1)
          ELSE 0
        END,
        'cant_ppto', 0,
        'cant_sicoe_aprobado', round(COALESCE(ob.ap_q, 0), 3),
        'cant_sicoe_no_revisado', round(COALESCE(ob.nr_q, 0), 3)
      )
      ORDER BY c.cap
    )
    FROM all_caps c
    LEFT JOIN obra ob ON ob.cap = c.cap
    LEFT JOIN ppto_split ps ON ps.cap = c.cap
  ),
  '[]'::jsonb
);
$f$;

-- Ítems dentro de un capítulo (nivel 1 → lista de barras).
CREATE OR REPLACE FUNCTION public.dashboard_drill_items_agg(
  p_contrato_id bigint,
  p_capitulo text,
  p_campo_nivel_max text DEFAULT 'nivel3_estado',
  p_niveles_activos bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $f$
WITH
cm AS (SELECT public._dash_norm_capitulo_key(p_capitulo) AS cap),
ppto AS (
  SELECT
    public._dash_norm_item_key(p.item) AS it,
    SUM(COALESCE(p.cant_total, 0)::numeric) AS p_cant,
    MAX(COALESCE(p.vlr_unitario, 0)::numeric) AS vu,
    SUM(CASE WHEN public._norm_estado_matriz(p.revisado) = 'Aprobado' THEN COALESCE(p.cant_total, 0)::numeric ELSE 0 END) AS cant_ap,
    SUM(CASE WHEN public._norm_estado_matriz(p.revisado) <> 'Aprobado' THEN COALESCE(p.cant_total, 0)::numeric ELSE 0 END) AS cant_nr,
    MAX(CASE WHEN p.descripcion IS NOT NULL AND btrim(p.descripcion::text) <> '' THEN p.descripcion::text END) AS descripcion
  FROM public.presupuesto p, cm
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_capitulo_key(p.capitulo) = cm.cap
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1
),
ppto_cost AS (
  SELECT
    it,
    p_cant,
    descripcion,
    public.dash_costo_agregado(p_cant, vu) AS p_cost,
    public.dash_costo_agregado(cant_ap, vu) AS pap,
    public.dash_costo_agregado(cant_nr, vu) AS pnr
  FROM ppto
),
regs AS (
  SELECT
    public._dash_norm_item_key(r.item_numero) AS it,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    r.cantidad_total::numeric AS cq,
    public._dash_matriz_nivel_max_estado(
      p_campo_nivel_max,
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6
  FROM public.so_registros r, cm
  WHERE r.contrato_id = p_contrato_id
    AND public._dash_norm_capitulo_key(r.capitulo) = cm.cap
),
obra AS (
  SELECT
    it,
    public.dash_costo_agregado(SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax = 'Aprobado'), MAX(vu)) AS ap_c,
    SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax = 'Aprobado') AS ap_q,
    public.dash_costo_agregado(
      SUM(cq) FILTER (
        WHERE it IS NOT NULL
          AND public._dash_prereqs_activos_aprobados_norm(
            p_niveles_activos,
            public._dash_nivel_num_desde_campo(p_campo_nivel_max),
            n1, n2, n3, n4, n5, n6
          )
          AND nmax = 'No Revisado'
      ),
      MAX(vu)
    ) AS nr_c,
    SUM(cq) FILTER (
      WHERE it IS NOT NULL
        AND public._dash_prereqs_activos_aprobados_norm(
          p_niveles_activos,
          public._dash_nivel_num_desde_campo(p_campo_nivel_max),
          n1, n2, n3, n4, n5, n6
        )
        AND nmax = 'No Revisado'
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
  (
    SELECT jsonb_agg(
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
    )
    FROM all_items ai
    LEFT JOIN ppto_cost pt ON pt.it = ai.it
    LEFT JOIN obra ob ON ob.it = ai.it
  ),
  '[]'::jsonb
);
$f$;

-- Tabla PK_ID para un capítulo + ítem (nivel 2 drill). Usa la misma clave de ítem normalizada.
CREATE OR REPLACE FUNCTION public.dashboard_pkid_tabla_agg(
  p_contrato_id bigint,
  p_capitulo text,
  p_item text,
  p_campo_nivel_max text DEFAULT 'nivel3_estado',
  p_niveles_activos bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
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
    COALESCE(p.vlr_unitario, 0)::numeric AS vu,
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
    MAX(vu) AS vu,
    SUM(cq) FILTER (WHERE rev_n = 'Aprobado') AS p_ap_q,
    SUM(cq) FILTER (WHERE rev_n = 'Pendiente') AS p_pd_q,
    SUM(cq) FILTER (WHERE rev_n = 'Rechazado') AS p_rj_q,
    SUM(cq) FILTER (
      WHERE rev_n IS DISTINCT FROM 'Aprobado'
        AND rev_n IS DISTINCT FROM 'Pendiente'
        AND rev_n IS DISTINCT FROM 'Rechazado'
    ) AS p_nr_q,
    MAX(CASE WHEN descripcion IS NOT NULL AND btrim(descripcion::text) <> '' THEN descripcion::text END) AS descl
  FROM pk_line
  GROUP BY pk_disp
),
-- Revisado dominante: el de la línea de mayor cantidad (igual espíritu que Python).
pk_rev AS (
  SELECT pk_disp, public._norm_estado_matriz(revisado) AS rev_dom
  FROM (
    SELECT
      pk_disp,
      revisado,
      cq,
      row_number() OVER (PARTITION BY pk_disp ORDER BY cq DESC NULLS LAST) AS rn
    FROM pk_line
  ) s
  WHERE rn = 1
),
regs AS (
  SELECT
    COALESCE(NULLIF(btrim(pk.pk_id::text), ''), '(sin pk)') AS pk_disp,
    COALESCE(r.vlr_unitario, 0)::numeric AS vu,
    r.cantidad_total::numeric AS cq,
    public._dash_matriz_nivel_max_estado(
      p_campo_nivel_max,
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax,
    public._norm_estado_matriz(r.nivel1_estado) AS n1,
    public._norm_estado_matriz(r.nivel2_estado) AS n2,
    public._norm_estado_matriz(r.nivel3_estado) AS n3,
    public._norm_estado_matriz(r.nivel4_estado) AS n4,
    public._norm_estado_matriz(r.nivel5_estado) AS n5,
    public._norm_estado_matriz(r.nivel6_estado) AS n6
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
    (
      public._dash_prereqs_activos_aprobados_norm(
        p_niveles_activos,
        public._dash_nivel_num_desde_campo(p_campo_nivel_max),
        n1, n2, n3, n4, n5, n6
      )
      AND nmax IS DISTINCT FROM 'Aprobado'
    ) AS in_cola
  FROM regs
),
obra_pk AS (
  SELECT
    pk_disp,
    MAX(vu) AS vu,
    SUM(cq) FILTER (WHERE nmax = 'Aprobado') AS ap_q,
    SUM(cq) FILTER (WHERE in_cola AND nmax = 'Pendiente') AS pe_q,
    SUM(cq) FILTER (WHERE in_cola AND nmax = 'Rechazado') AS rej_q,
    SUM(cq) FILTER (
      WHERE in_cola AND nmax IS DISTINCT FROM 'Pendiente' AND nmax IS DISTINCT FROM 'Rechazado'
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
    public.dash_costo_agregado(
      COALESCE(pp.p_ap_q, 0) + COALESCE(pp.p_nr_q, 0) + COALESCE(pp.p_pd_q, 0) + COALESCE(pp.p_rj_q, 0),
      COALESCE(pp.vu, 0)
    ) AS costo_ppto,
    round(COALESCE(pp.p_ap_q, 0), 2) AS cant_ppto_aprobado_n3,
    public.dash_costo_agregado(COALESCE(pp.p_ap_q, 0), COALESCE(pp.vu, 0)) AS costo_ppto_aprobado_n3,
    round(COALESCE(pp.p_nr_q, 0), 2) AS cant_ppto_estado_no_revisado,
    public.dash_costo_agregado(COALESCE(pp.p_nr_q, 0), COALESCE(pp.vu, 0)) AS costo_ppto_estado_no_revisado,
    round(COALESCE(pp.p_pd_q, 0), 2) AS cant_ppto_estado_pendiente,
    public.dash_costo_agregado(COALESCE(pp.p_pd_q, 0), COALESCE(pp.vu, 0)) AS costo_ppto_estado_pendiente,
    round(COALESCE(pp.p_rj_q, 0), 2) AS cant_ppto_estado_rechazado,
    public.dash_costo_agregado(COALESCE(pp.p_rj_q, 0), COALESCE(pp.vu, 0)) AS costo_ppto_estado_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe_aprobado,
    public.dash_costo_agregado(COALESCE(o.ap_q, 0), COALESCE(o.vu, 0)) AS costo_sicoe_aprobado,
    round(COALESCE(o.nr_q, 0), 2) AS cant_sicoe_no_revisado,
    public.dash_costo_agregado(COALESCE(o.nr_q, 0), COALESCE(o.vu, 0)) AS costo_sicoe_no_revisado,
    round(COALESCE(o.pe_q, 0), 2) AS cant_sicoe_pendiente,
    public.dash_costo_agregado(COALESCE(o.pe_q, 0), COALESCE(o.vu, 0)) AS costo_sicoe_pendiente,
    round(COALESCE(o.rej_q, 0), 2) AS cant_sicoe_rechazado,
    public.dash_costo_agregado(COALESCE(o.rej_q, 0), COALESCE(o.vu, 0)) AS costo_sicoe_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe,
    public.dash_costo_agregado(COALESCE(o.ap_q, 0), COALESCE(o.vu, 0)) AS costo_sicoe,
    0.0::numeric AS cant_facturado,
    0.0::numeric AS costo_facturado,
    round(COALESCE(pp.p_ap_q, 0) - COALESCE(o.ap_q, 0), 2) AS delta_cant,
    public.dash_costo_agregado(COALESCE(pp.p_ap_q, 0), COALESCE(pp.vu, 0))
      - public.dash_costo_agregado(COALESCE(o.ap_q, 0), COALESCE(o.vu, 0)) AS delta_costo,
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

COMMENT ON FUNCTION public.dashboard_drill_capitulos_agg(bigint, text, bigint[]) IS
  'Dashboard drill nivel capítulos: obra aprobada/cola según nivel máximo y prerequisitos de niveles activos inferiores.';
COMMENT ON FUNCTION public.dashboard_drill_items_agg(bigint, text, text, bigint[]) IS
  'Dashboard drill ítems por capítulo: obra aprobada / cola según nivel máximo y niveles_activos.';
COMMENT ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text, text, bigint[]) IS
  'Tabla PK_ID: cola obra = prerequisitos activos aprobados y nivel máximo no aprobado; pendiente/rechazado en columnas propias.';

GRANT EXECUTE ON FUNCTION public._dash_norm_item_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_matriz_nivel_max_estado(text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_nivel_num_desde_campo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_prereqs_activos_aprobados_norm(bigint[], smallint, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_capitulos_agg(bigint, text, bigint[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_items_agg(bigint, text, text, bigint[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text, text, bigint[]) TO authenticated, service_role;
