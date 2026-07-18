-- Dashboard fase 2: V.U. desde listado_precios (cap+item)


-- === dashboard_listado_vu.sql ===

-- V.U. vigente del Listado de Precios por (contrato, capÃ­tulo, Ã­tem).
-- Fuente de verdad para costo agregado dashboard (ClaraCore y Cobrado).

CREATE OR REPLACE FUNCTION public._dash_listado_vu(
  p_contrato_id bigint,
  p_capitulo text,
  p_item text
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT lp.precio_unitario::numeric
      FROM public.listado_precios lp
      WHERE lp.contrato_id = p_contrato_id
        AND public._dash_norm_capitulo_key(lp.capitulo) = public._dash_norm_capitulo_key(p_capitulo)
        AND public._dash_norm_item_key(lp.item_numero) = public._dash_norm_item_key(p_item)
      ORDER BY lp.id DESC
      LIMIT 1
    ),
    0::numeric
  );
$$;

COMMENT ON FUNCTION public._dash_listado_vu(bigint, text, text) IS
  'V.U. vigente listado_precios para capÃ­tulo+Ã­tem; 0 si no existe.';

GRANT EXECUTE ON FUNCTION public._dash_listado_vu(bigint, text, text) TO authenticated, service_role;


-- === dashboard_drill_agg.sql ===

-- Dashboard drill: agregaciÃ³n en BD (reemplaza bucles Python en /dashboard-drill y /dashboard-pkid-tabla).
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql).
-- Requiere public._dash_listado_vu (ver dashboard_listado_vu.sql).
-- Ejecutar en Supabase SQL Editor tras revisar nombres de vista / columnas.
--
-- Quitar firmas antiguas (solo p_contrato_id / sin nivel mÃ¡ximo); si no, coexisten sobrecargas
-- y PostgREST puede seguir llamando la versiÃ³n equivocada.
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
    ELSE round(round(COALESCE(p_cant, 0), 2) * COALESCE(p_vu, 0), 0)
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
    WHEN txt IS NULL OR btrim(txt) = '' THEN 'Sin capÃ­tulo'
    ELSE btrim(txt)
  END;
$$;

-- ComparaciÃ³n estable capÃ­tulo obra vs presupuesto: colapsa espacios y quita espacio tras Â«4. Â».
CREATE OR REPLACE FUNCTION public._dash_norm_capitulo_key(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN txt IS NULL OR btrim(txt) = '' THEN 'Sin capÃ­tulo'
    ELSE regexp_replace(
      regexp_replace(btrim(txt), '\s+', ' ', 'g'),
      '^(\d+\.)\s+',
      '\1',
      ''
    )
  END;
$$;

-- Estado normalizado del nivel final del contrato (p_campo = 'nivel3_estado' â€¦ 'nivel6_estado').
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

-- NÃºmero de nivel 1..6 a partir del nombre de columna estado (p. ej. nivel4_estado â†’ 4).
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

-- Todos los niveles listados en p_niveles_activos y estrictamente menores a p_max_n deben estar Â«AprobadoÂ»
-- (estados n1..n6 ya normalizados con _norm_estado_matriz). Ej. activos {1,2,4}, max 4 â†’ exige N1 y N2.
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

-- Listado por capÃ­tulo (nivel 1 drill).
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
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capÃ­tulo'
        ELSE r.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(r.item_numero) AS it,
    round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
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
    SUM(public.dash_costo_agregado(ap_q, public._dash_listado_vu(p_contrato_id, cap, it))) AS ap_c,
    SUM(ap_q) AS ap_q,
    SUM(public.dash_costo_agregado(nr_q, public._dash_listado_vu(p_contrato_id, cap, it))) AS nr_c,
    SUM(nr_q) AS nr_q
  FROM sicoe_item
  GROUP BY cap
),
ppto_items AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN p.capitulo IS NULL OR btrim(p.capitulo::text) = '' THEN 'Sin capÃ­tulo'
        ELSE p.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(p.item) AS it,
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
    SUM(public.dash_costo_agregado(cant_ap, public._dash_listado_vu(p_contrato_id, cap, it))) AS pap,
    SUM(public.dash_costo_agregado(cant_nr, public._dash_listado_vu(p_contrato_id, cap, it))) AS pnr,
    SUM(public.dash_costo_agregado(cant_ap + cant_nr, public._dash_listado_vu(p_contrato_id, cap, it))) AS pres
  FROM ppto_items
  GROUP BY cap
),
all_caps AS (
  SELECT cap FROM ppto_split
  UNION
  SELECT o.cap FROM obra o
)
-- Sub-SELECT: si all_caps estÃ¡ vacÃ­o, jsonb_agg sobre 0 filas devuelve NULL en una fila â†’ COALESCE â†’ '[]'.
-- Sin este envoltorio, FROM vacÃ­o hace que la funciÃ³n no devuelva fila y PostgREST recibe NULL (Ã­tems no cargan).
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

-- Ãtems dentro de un capÃ­tulo (nivel 1 â†’ lista de barras).
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
    public.dash_costo_agregado(p_cant, public._dash_listado_vu(p_contrato_id, p_capitulo, it)) AS p_cost,
    public.dash_costo_agregado(cant_ap, public._dash_listado_vu(p_contrato_id, p_capitulo, it)) AS pap,
    public.dash_costo_agregado(cant_nr, public._dash_listado_vu(p_contrato_id, p_capitulo, it)) AS pnr
  FROM ppto
),
regs AS (
  SELECT
    public._dash_norm_item_key(r.item_numero) AS it,
    round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
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
    public.dash_costo_agregado(
      SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax = 'Aprobado'),
      public._dash_listado_vu(p_contrato_id, p_capitulo, it)
    ) AS ap_c,
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
      public._dash_listado_vu(p_contrato_id, p_capitulo, it)
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

-- Tabla PK_ID para un capÃ­tulo + Ã­tem (nivel 2 drill). Usa la misma clave de Ã­tem normalizada.
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
lv AS (
  SELECT public._dash_listado_vu(p_contrato_id, p_capitulo, p_item) AS vu
),
pk_line AS (
  SELECT
    COALESCE(NULLIF(btrim(p.pk_id::text), ''), '(sin pk)') AS pk_disp,
    round(COALESCE(p.cant_total, 0)::numeric, 2) AS cq,
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
-- Revisado dominante: el de la lÃ­nea de mayor cantidad (igual espÃ­ritu que Python).
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
    round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
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
      (SELECT vu FROM lv)
    ) AS costo_ppto,
    round(COALESCE(pp.p_ap_q, 0), 2) AS cant_ppto_aprobado_n3,
    public.dash_costo_agregado(COALESCE(pp.p_ap_q, 0), (SELECT vu FROM lv)) AS costo_ppto_aprobado_n3,
    round(COALESCE(pp.p_nr_q, 0), 2) AS cant_ppto_estado_no_revisado,
    public.dash_costo_agregado(COALESCE(pp.p_nr_q, 0), (SELECT vu FROM lv)) AS costo_ppto_estado_no_revisado,
    round(COALESCE(pp.p_pd_q, 0), 2) AS cant_ppto_estado_pendiente,
    public.dash_costo_agregado(COALESCE(pp.p_pd_q, 0), (SELECT vu FROM lv)) AS costo_ppto_estado_pendiente,
    round(COALESCE(pp.p_rj_q, 0), 2) AS cant_ppto_estado_rechazado,
    public.dash_costo_agregado(COALESCE(pp.p_rj_q, 0), (SELECT vu FROM lv)) AS costo_ppto_estado_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe_aprobado,
    public.dash_costo_agregado(COALESCE(o.ap_q, 0), (SELECT vu FROM lv)) AS costo_sicoe_aprobado,
    round(COALESCE(o.nr_q, 0), 2) AS cant_sicoe_no_revisado,
    public.dash_costo_agregado(COALESCE(o.nr_q, 0), (SELECT vu FROM lv)) AS costo_sicoe_no_revisado,
    round(COALESCE(o.pe_q, 0), 2) AS cant_sicoe_pendiente,
    public.dash_costo_agregado(COALESCE(o.pe_q, 0), (SELECT vu FROM lv)) AS costo_sicoe_pendiente,
    round(COALESCE(o.rej_q, 0), 2) AS cant_sicoe_rechazado,
    public.dash_costo_agregado(COALESCE(o.rej_q, 0), (SELECT vu FROM lv)) AS costo_sicoe_rechazado,
    round(COALESCE(o.ap_q, 0), 2) AS cant_sicoe,
    public.dash_costo_agregado(COALESCE(o.ap_q, 0), (SELECT vu FROM lv)) AS costo_sicoe,
    0.0::numeric AS cant_facturado,
    0.0::numeric AS costo_facturado,
    round(COALESCE(pp.p_ap_q, 0) - COALESCE(o.ap_q, 0), 2) AS delta_cant,
    public.dash_costo_agregado(COALESCE(pp.p_ap_q, 0), (SELECT vu FROM lv))
      - public.dash_costo_agregado(COALESCE(o.ap_q, 0), (SELECT vu FROM lv)) AS delta_costo,
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
  'Dashboard drill nivel capÃ­tulos: obra aprobada/cola segÃºn nivel mÃ¡ximo y prerequisitos de niveles activos inferiores.';
COMMENT ON FUNCTION public.dashboard_drill_items_agg(bigint, text, text, bigint[]) IS
  'Dashboard drill Ã­tems por capÃ­tulo: obra aprobada / cola segÃºn nivel mÃ¡ximo y niveles_activos.';
COMMENT ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text, text, bigint[]) IS
  'Tabla PK_ID: cola obra = prerequisitos activos aprobados y nivel mÃ¡ximo no aprobado; pendiente/rechazado en columnas propias.';

GRANT EXECUTE ON FUNCTION public._dash_norm_item_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_norm_capitulo_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_matriz_nivel_max_estado(text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_nivel_num_desde_campo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._dash_prereqs_activos_aprobados_norm(bigint[], smallint, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_capitulos_agg(bigint, text, bigint[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_drill_items_agg(bigint, text, text, bigint[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_pkid_tabla_agg(bigint, text, text, text, bigint[]) TO authenticated, service_role;


-- === dashboard_resumen_sicoe.sql ===

-- Dashboard SICOE â€” resumen en una sola consulta (sin tabla cobro).
-- Obra: aprobado y Â«colaÂ» segÃºn el nivel mÃ¡ximo activo del contrato (p_campo_nivel_max).
-- Presupuesto: columna revisado (validaciÃ³n en polÃ­gonos); los campos JSON *aprobado_n3* son etiqueta histÃ³rica.
-- Requiere public._norm_estado_matriz (ver dashboard_matriz_validacion.sql) y, en la misma BD,
--   public._dash_norm_capitulo_key + public._dash_matriz_nivel_max_estado (ver dashboard_drill_agg.sql).
-- Ejecutar primero dashboard_drill_agg.sql si aÃºn no existen esas funciones.

DROP FUNCTION IF EXISTS public.dashboard_resumen_sicoe_agg(bigint);
DROP FUNCTION IF EXISTS public.dashboard_resumen_sicoe_agg(bigint, text);

CREATE OR REPLACE FUNCTION public.dashboard_resumen_sicoe_agg(
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
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capÃ­tulo'
        ELSE r.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(r.item_numero) AS it,
    round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
    r.acta_rpo_id AS aid,
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
    COALESCE(TRIM(r.item_numero::text), '') <> '' AS has_item
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
),
sicoe_item AS (
  SELECT
    cap,
    it,
    aid,
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
  GROUP BY cap, it, aid
),
tot_cob AS (
  SELECT COALESCE(SUM(public.dash_costo_agregado(ap_q, public._dash_listado_vu(p_contrato_id, cap, it))), 0)::numeric AS t
  FROM sicoe_item
  WHERE ap_q IS NOT NULL AND ap_q <> 0
),
obra_caps AS (
  SELECT cap, SUM(public.dash_costo_agregado(ap_q, public._dash_listado_vu(p_contrato_id, cap, it))) AS cob
  FROM sicoe_item
  GROUP BY cap
),
obra_nr_caps AS (
  SELECT cap, SUM(public.dash_costo_agregado(nr_q, public._dash_listado_vu(p_contrato_id, cap, it))) AS cob_nr
  FROM sicoe_item
  WHERE nr_q IS NOT NULL AND nr_q <> 0
  GROUP BY cap
),
tot_nr AS (
  SELECT COALESCE(SUM(cob_nr), 0)::numeric AS t FROM obra_nr_caps
),
ppto_item AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN p.capitulo IS NULL OR btrim(p.capitulo::text) = '' THEN 'Sin capÃ­tulo'
        ELSE p.capitulo::text
      END
    ) AS cap,
    public._dash_norm_item_key(p.item) AS it,
    public._norm_estado_matriz(p.revisado) AS rv,
    SUM(COALESCE(p.cant_total, 0)::numeric) AS cant
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1, 2, 3
),
ppto_estado AS (
  SELECT cap, rv, SUM(public.dash_costo_agregado(cant, public._dash_listado_vu(p_contrato_id, cap, it))) AS costo
  FROM ppto_item
  GROUP BY cap, rv
),
ppto_ap_cap AS (
  SELECT cap, SUM(costo) AS pres_ap
  FROM ppto_estado
  WHERE rv = 'Aprobado'
  GROUP BY cap
),
ppto_nap_cap AS (
  SELECT cap, SUM(costo) AS pres_nr
  FROM ppto_estado
  WHERE rv <> 'Aprobado'
  GROUP BY cap
),
tot_ppto_ap AS (
  SELECT COALESCE(SUM(pres_ap), 0)::numeric AS t FROM ppto_ap_cap
),
tot_ppto_nap AS (
  SELECT COALESCE(SUM(pres_nr), 0)::numeric AS t FROM ppto_nap_cap
),
acta_item AS (
  SELECT aid, it, SUM(ap_q) AS ap_q, cap
  FROM sicoe_item
  WHERE aid IS NOT NULL AND ap_q IS NOT NULL AND ap_q <> 0
  GROUP BY aid, it, cap
),
acta_agg AS (
  SELECT a.numero_rpo::numeric AS nr, SUM(public.dash_costo_agregado(ai.ap_q, public._dash_listado_vu(p_contrato_id, ai.cap, ai.it))) AS cob
  FROM acta_item ai
  INNER JOIN public.actas a ON a.id = ai.aid AND a.contrato_id = p_contrato_id
  GROUP BY a.numero_rpo
),
ppto_rows AS (
  SELECT cap, SUM(costo) AS pres
  FROM ppto_estado
  GROUP BY cap
),
ppto_tot AS (
  SELECT COALESCE(SUM(pres), 0)::numeric AS t FROM ppto_rows
),
all_caps AS (
  SELECT cap FROM obra_caps
  UNION
  SELECT cap FROM ppto_rows
  UNION
  SELECT cap FROM obra_nr_caps
  UNION
  SELECT cap FROM ppto_ap_cap
  UNION
  SELECT cap FROM ppto_nap_cap
),
comparativo AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'capitulo', c.cap,
      'presupuesto', COALESCE(pr.pres, 0),
      'cobrado', round(COALESCE(ob.cob, 0)::numeric, 2),
      'sicoe_no_revisado_n3', round(COALESCE(onr.cob_nr, 0)::numeric, 2),
      'presupuesto_aprobado_n3', round(COALESCE(pap.pres_ap, 0)::numeric, 2),
      'presupuesto_no_revisado_n3', round(COALESCE(pnap.pres_nr, 0)::numeric, 2),
      'delta', round(COALESCE(pr.pres, 0) - COALESCE(ob.cob, 0), 2),
      'consumo_pct',
      CASE
        WHEN COALESCE(pr.pres, 0) > 0 THEN round(COALESCE(ob.cob, 0) / pr.pres * 100, 1)
        ELSE 0
      END
    )
    ORDER BY c.cap
  ) AS j
  FROM all_caps c
  LEFT JOIN obra_caps ob ON ob.cap = c.cap
  LEFT JOIN obra_nr_caps onr ON onr.cap = c.cap
  LEFT JOIN ppto_rows pr ON pr.cap = c.cap
  LEFT JOIN ppto_ap_cap pap ON pap.cap = c.cap
  LEFT JOIN ppto_nap_cap pnap ON pnap.cap = c.cap
),
por_acta AS (
  SELECT jsonb_agg(
    jsonb_build_object('acta', nr, 'cobrado', round(cob::numeric, 2))
    ORDER BY nr DESC NULLS LAST
  ) AS j
  FROM acta_agg
),
actas_list AS (
  SELECT jsonb_agg(nr ORDER BY nr DESC NULLS LAST) AS j FROM acta_agg
)
SELECT jsonb_build_object(
  'dashboard_schema', 2,
  'total_presupuesto', (SELECT t FROM ppto_tot),
  'total_cobrado', round((SELECT t FROM tot_cob), 2),
  'total_sicoe_n3_no_revisado', round((SELECT t FROM tot_nr), 2),
  'total_presupuesto_aprobado_n3', round((SELECT t FROM tot_ppto_ap), 2),
  'total_presupuesto_no_revisado_n3', round((SELECT t FROM tot_ppto_nap), 2),
  'delta', round((SELECT t FROM ppto_tot) - (SELECT t FROM tot_cob), 2),
  'consumo_pct',
  CASE
    WHEN (SELECT t FROM ppto_tot) > 0 THEN round((SELECT t FROM tot_cob) / (SELECT t FROM ppto_tot) * 100, 1)
    ELSE 0
  END,
  'actas', COALESCE((SELECT j FROM actas_list), '[]'::jsonb),
  'comparativo_capitulos', COALESCE((SELECT j FROM comparativo), '[]'::jsonb),
  'por_acta', COALESCE((SELECT j FROM por_acta), '[]'::jsonb)
);
$f$;

COMMENT ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) IS
  'Dashboard resumen v2: obra segÃºn nivel mÃ¡ximo y prerequisitos de niveles activos; presupuesto por revisado.';

GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumen_sicoe_agg(bigint, text, bigint[]) TO service_role;


-- === dashboard_capitulos_financiero_agg.sql ===

-- Panorama financiero por capÃ­tulo (AIU + IVA) para dashboard-capitulos-financiero.
-- Requiere: dashboard_drill_agg.sql (_dash_norm_*, dash_costo_agregado, _dash_matriz_nivel_max_estado)
--           rpo_panel_admin_agg.sql (rpo_panel_bloque_capitulo)

CREATE OR REPLACE FUNCTION public._gerencial_item_bloque(
  p_tipo_calculo text,
  p_capitulo text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN upper(btrim(COALESCE(p_tipo_calculo, ''))) = 'IVA' THEN 'iva'
    WHEN upper(btrim(COALESCE(p_tipo_calculo, ''))) = 'AIU' THEN 'aiu'
    WHEN public.rpo_panel_bloque_capitulo(p_capitulo) = 'ensayos' THEN 'iva'
    ELSE 'aiu'
  END;
$f$;

CREATE OR REPLACE FUNCTION public.dashboard_capitulos_financiero_agg(
  p_contrato_id bigint,
  p_vista text DEFAULT 'presupuesto_obra',
  p_solo_interv_aprobado boolean DEFAULT false,
  p_acta_rpo_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $BODY$
WITH cfg AS (
  SELECT
    COALESCE(
      (SELECT c.niveles_activos::bigint[]
         FROM public.contrato_niveles_validacion c
        WHERE c.contrato_id = p_contrato_id
        LIMIT 1),
      ARRAY[1::bigint, 2::bigint, 3::bigint]
    ) AS na,
    COALESCE(
      (SELECT max(u::smallint) FROM unnest(
        COALESCE(
          (SELECT c.niveles_activos::bigint[]
             FROM public.contrato_niveles_validacion c
            WHERE c.contrato_id = p_contrato_id
            LIMIT 1),
          ARRAY[1::bigint, 2::bigint, 3::bigint]
        )
      ) AS u(u)),
      3::smallint
    ) AS nmax_num
),
cfg2 AS (
  SELECT
    na,
    nmax_num,
    ('nivel' || nmax_num::text || '_estado') AS campo_max
  FROM cfg
),
vista_cfg AS (
  SELECT
    CASE
      WHEN lower(btrim(COALESCE(p_vista, ''))) IN ('obra_ejecutada', 'obra ejecutada')
        THEN 'Obra Ejecutada'
      ELSE 'Presupuesto de Obra'
    END AS tipo_ppto,
    (lower(btrim(COALESCE(p_vista, ''))) IN ('obra_ejecutada', 'obra ejecutada')) AS oe
),
oficial AS (
  SELECT pv.id
  FROM public.presupuesto_versiones pv
  WHERE pv.contrato_id = p_contrato_id
    AND COALESCE(pv.es_vigente_aprobada, false) = true
  LIMIT 1
),
listado AS (
  SELECT
    public._dash_norm_capitulo_key(lp.capitulo) AS cap_k,
    public._dash_norm_item_key(lp.item_numero) AS it_k,
    (array_agg(upper(btrim(COALESCE(lp.tipo_calculo, ''))) ORDER BY lp.capitulo, lp.item_numero))[1] AS tc,
    MAX(COALESCE(lp.precio_unitario, 0)::numeric) AS lp_vu
  FROM public.listado_precios lp
  WHERE lp.contrato_id = p_contrato_id
    AND public._dash_norm_item_key(lp.item_numero) IS NOT NULL
  GROUP BY 1, 2
),
ppto_obra_ref AS (
  SELECT
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS it_k,
    MAX(COALESCE(p.vlr_unitario, 0)::numeric) AS po_vu
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.tipo_ejecucion = 'Presupuesto de Obra'
    AND public._dash_norm_item_key(p.item) IS NOT NULL
  GROUP BY 1, 2
),
ppto_raw AS (
  SELECT
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS it_k,
    public._dash_norm_capitulo(p.capitulo) AS cap_display,
    COALESCE(p.cant_total, 0)::numeric AS cq,
    COALESCE(p.vlr_unitario, 0)::numeric AS vu,
    public._norm_estado_matriz(p.revisado) AS rev
  FROM public.presupuesto_version_items p
  CROSS JOIN vista_cfg v
  CROSS JOIN oficial o
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.version_id = o.id
    AND v.tipo_ppto = 'Presupuesto de Obra'
    AND public._dash_norm_item_key(p.item) IS NOT NULL
    AND (
      NOT COALESCE(p_solo_interv_aprobado, false)
      OR p.pre_interv_estado IS NULL
      OR btrim(p.pre_interv_estado) = 'Aprobado'
    )
  UNION ALL
  SELECT
    public._dash_norm_capitulo_key(p.capitulo) AS cap_k,
    public._dash_norm_item_key(p.item) AS it_k,
    public._dash_norm_capitulo(p.capitulo) AS cap_display,
    COALESCE(p.cant_total, 0)::numeric AS cq,
    COALESCE(p.vlr_unitario, 0)::numeric AS vu,
    public._norm_estado_matriz(p.revisado) AS rev
  FROM public.presupuesto p
  CROSS JOIN vista_cfg v
  WHERE p.contrato_id = p_contrato_id
    AND COALESCE(p.dado_de_baja, false) = false
    AND p.tipo_ejecucion = v.tipo_ppto
    AND public._dash_norm_item_key(p.item) IS NOT NULL
    AND (
      v.tipo_ppto = 'Obra Ejecutada'
      OR NOT EXISTS (SELECT 1 FROM oficial o WHERE o.id IS NOT NULL)
    )
    AND (
      NOT COALESCE(p_solo_interv_aprobado, false)
      OR p.pre_interv_estado IS NULL
      OR btrim(p.pre_interv_estado) = 'Aprobado'
    )
),
ppto_items AS (
  SELECT
    cap_k,
    it_k,
    MAX(cap_display) AS cap_display,
    MAX(vu) AS vu,
    SUM(CASE WHEN rev = 'Aprobado' THEN cq ELSE 0 END) AS ap_q,
    SUM(CASE WHEN rev = 'Pendiente' THEN cq ELSE 0 END) AS pe_q,
    SUM(CASE WHEN rev = 'Rechazado' THEN cq ELSE 0 END) AS re_q,
    SUM(CASE WHEN rev NOT IN ('Aprobado', 'Pendiente', 'Rechazado') THEN cq ELSE 0 END) AS nr_q
  FROM ppto_raw
  GROUP BY cap_k, it_k
),
ppto_costs AS (
  SELECT
    pi.cap_k,
    pi.it_k,
    pi.cap_display,
    COALESCE(l.lp_vu, 0) AS vu_eff,
    public.dash_costo_agregado(pi.ap_q, COALESCE(l.lp_vu, 0)) AS ap,
    public.dash_costo_agregado(pi.pe_q, COALESCE(l.lp_vu, 0)) AS pe,
    public.dash_costo_agregado(pi.re_q, COALESCE(l.lp_vu, 0)) AS re,
    public.dash_costo_agregado(pi.nr_q, COALESCE(l.lp_vu, 0)) AS nr,
    public.dash_costo_agregado(
      CASE
        WHEN (SELECT oe FROM vista_cfg)
          THEN COALESCE(pi.ap_q, 0) + COALESCE(pi.pe_q, 0) + COALESCE(pi.re_q, 0) + COALESCE(pi.nr_q, 0)
        ELSE COALESCE(pi.ap_q, 0) + COALESCE(pi.nr_q, 0)
      END,
      COALESCE(l.lp_vu, 0)
    ) AS cc_total
  FROM ppto_items pi
  LEFT JOIN listado l ON l.cap_k = pi.cap_k AND l.it_k = pi.it_k
),
sicoe_regs AS (
  SELECT
    public._dash_norm_capitulo_key(
      CASE
        WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capÃ­tulo'
        ELSE r.capitulo::text
      END
    ) AS cap_k,
    public._dash_norm_item_key(r.item_numero) AS it_k,
    public._dash_norm_capitulo(r.capitulo) AS cap_display,
    round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
    public._dash_matriz_nivel_max_estado(
      (SELECT campo_max FROM cfg2),
      r.nivel1_estado, r.nivel2_estado, r.nivel3_estado,
      r.nivel4_estado, r.nivel5_estado, r.nivel6_estado
    ) AS nmax
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND (p_acta_rpo_id IS NULL OR r.acta_rpo_id = p_acta_rpo_id)
    AND public._dash_norm_item_key(r.item_numero) IS NOT NULL
),
sicoe_items AS (
  SELECT
    cap_k,
    it_k,
    MAX(cap_display) AS cap_display,
    public.dash_costo_agregado(
      SUM(cq) FILTER (WHERE nmax = 'Aprobado'),
      public._dash_listado_vu(p_contrato_id, cap_k, it_k)
    ) AS ap_c
  FROM sicoe_regs
  GROUP BY cap_k, it_k
),
all_keys AS (
  SELECT cap_k, it_k FROM ppto_costs
  UNION
  SELECT s.cap_k, s.it_k
  FROM sicoe_items s
  -- <> 0 (no solo > 0): los registros de reversiÃ³n "No Previsto" cobran cantidades
  -- negativas; deben netearse, no descartarse (igual que el drill/Excel).
  WHERE COALESCE(s.ap_c, 0) <> 0
),
item_rows AS (
  SELECT
    ak.cap_k,
    ak.it_k,
    COALESCE(p.cap_display, s.cap_display, ak.cap_k) AS cap_display,
    public._gerencial_item_bloque(l.tc, COALESCE(p.cap_display, s.cap_display, ak.cap_k)) AS bloque,
    COALESCE(p.ap, 0)::numeric AS ap,
    COALESCE(p.pe, 0)::numeric AS pe,
    COALESCE(p.re, 0)::numeric AS re,
    COALESCE(p.nr, 0)::numeric AS nr,
    COALESCE(s.ap_c, 0)::numeric AS cob,
    CASE
      WHEN p.it_k IS NOT NULL THEN COALESCE(p.cc_total, 0)
      WHEN COALESCE(s.ap_c, 0) <> 0 THEN COALESCE(s.ap_c, 0)
      ELSE 0::numeric
    END AS claracore
  FROM all_keys ak
  LEFT JOIN ppto_costs p ON p.cap_k = ak.cap_k AND p.it_k = ak.it_k
  LEFT JOIN sicoe_items s ON s.cap_k = ak.cap_k AND s.it_k = ak.it_k
  LEFT JOIN listado l ON l.cap_k = ak.cap_k AND l.it_k = ak.it_k
  WHERE p.it_k IS NOT NULL OR COALESCE(s.ap_c, 0) <> 0
),
cap_agg AS (
  SELECT
    ir.bloque,
    ir.cap_k,
    MAX(ir.cap_display) AS capitulo,
    ROUND(SUM(ir.claracore), 0)::numeric AS claracore,
    ROUND(SUM(ir.cob), 0)::numeric AS cobrado,
    ROUND(SUM(ir.ap), 0)::numeric AS aprobado,
    ROUND(SUM(ir.pe), 0)::numeric AS pendiente,
    ROUND(SUM(ir.re), 0)::numeric AS rechazado,
    ROUND(SUM(ir.nr), 0)::numeric AS no_revisado
  FROM item_rows ir
  WHERE ir.bloque IN ('aiu', 'iva')
    AND (ir.claracore <> 0 OR ir.cob <> 0)
  GROUP BY ir.bloque, ir.cap_k
),
cap_json AS (
  SELECT
    bloque,
    jsonb_agg(
      jsonb_build_object(
        'capitulo', c.capitulo,
        'claracore', c.claracore,
        'cobrado', c.cobrado,
        'delta', c.claracore - c.cobrado,
        'aprobado', c.aprobado,
        'pendiente', c.pendiente,
        'rechazado', c.rechazado,
        'no_revisado', c.no_revisado
      )
      ORDER BY
        CASE WHEN c.capitulo ~ '^\s*(\d+)' THEN (substring(c.capitulo FROM '^\s*(\d+)'))::int ELSE 999999 END,
        lower(c.capitulo)
    ) AS rows
  FROM cap_agg c
  GROUP BY bloque
)
SELECT jsonb_build_object(
  'capitulos_aiu', COALESCE((SELECT rows FROM cap_json WHERE bloque = 'aiu'), '[]'::jsonb),
  'capitulos_iva', COALESCE((SELECT rows FROM cap_json WHERE bloque = 'iva'), '[]'::jsonb)
);
$BODY$;

COMMENT ON FUNCTION public.dashboard_capitulos_financiero_agg(bigint, text, boolean, bigint) IS
  'Dashboard capitulos-financiero: agregaciÃ³n AIU/IVA por capÃ­tulo (presupuesto + SICOE aprobado).';

GRANT EXECUTE ON FUNCTION public._gerencial_item_bloque(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_capitulos_financiero_agg(bigint, text, boolean, bigint)
  TO authenticated, service_role;


-- === vm_dashboard ===

DROP MATERIALIZED VIEW IF EXISTS public.vm_dashboard_por_acta CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.vm_dashboard_resumen CASCADE;

CREATE MATERIALIZED VIEW public.vm_dashboard_resumen AS
WITH regs AS (
    SELECT
        r.contrato_id,
        public._dash_norm_capitulo_key(
            CASE
                WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capÃ­tulo'
                ELSE r.capitulo::text
            END
        ) AS capitulo,
        public._dash_norm_item_key(r.item_numero) AS it,
        COALESCE(r.vlr_unitario, 0)::numeric AS vu,
        round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
        r.costo_directo::numeric AS cd,
        public._norm_estado_matriz(r.nivel1_estado) AS n1,
        public._norm_estado_matriz(r.nivel2_estado) AS n2,
        public._norm_estado_matriz(r.nivel3_estado) AS n3,
        public._norm_estado_matriz(r.nivel4_estado) AS n4,
        public._norm_estado_matriz(r.nivel5_estado) AS n5,
        public._norm_estado_matriz(r.nivel6_estado) AS n6,
        public._dash_matriz_nivel_max_estado('nivel1_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax1,
        public._dash_matriz_nivel_max_estado('nivel2_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax2,
        public._dash_matriz_nivel_max_estado('nivel3_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax3,
        public._dash_matriz_nivel_max_estado('nivel4_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax4,
        public._dash_matriz_nivel_max_estado('nivel5_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax5,
        public._dash_matriz_nivel_max_estado('nivel6_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax6,
        COALESCE(TRIM(r.item_numero::text), '') <> '' AS has_item
    FROM public.so_registros r
),
item_agg AS (
    SELECT
        contrato_id,
        capitulo,
        it,
        MAX(vu) AS vu,
        SUM(cq) FILTER (WHERE nmax1 = 'Aprobado') AS ap_q1,
        SUM(cq) FILTER (WHERE nmax2 = 'Aprobado') AS ap_q2,
        SUM(cq) FILTER (WHERE nmax3 = 'Aprobado') AS ap_q3,
        SUM(cq) FILTER (WHERE nmax4 = 'Aprobado') AS ap_q4,
        SUM(cq) FILTER (WHERE nmax5 = 'Aprobado') AS ap_q5,
        SUM(cq) FILTER (WHERE nmax6 = 'Aprobado') AS ap_q6,
        SUM(cq) FILTER (WHERE has_item AND nmax3 = 'No Revisado') AS nr_q3,
        SUM(cq) FILTER (WHERE has_item AND nmax4 = 'No Revisado') AS nr_q4,
        SUM(cq) FILTER (WHERE has_item AND nmax5 = 'No Revisado') AS nr_q5,
        SUM(cq) FILTER (WHERE has_item AND nmax6 = 'No Revisado') AS nr_q6
    FROM regs
    WHERE it IS NOT NULL
    GROUP BY contrato_id, capitulo, it
),
item_cost AS (
    SELECT
        contrato_id,
        capitulo,
        public.dash_costo_agregado(ap_q1, public._dash_listado_vu(contrato_id, capitulo, it)) AS c1,
        public.dash_costo_agregado(ap_q2, public._dash_listado_vu(contrato_id, capitulo, it)) AS c2,
        public.dash_costo_agregado(ap_q3, public._dash_listado_vu(contrato_id, capitulo, it)) AS c3,
        public.dash_costo_agregado(ap_q4, public._dash_listado_vu(contrato_id, capitulo, it)) AS c4,
        public.dash_costo_agregado(ap_q5, public._dash_listado_vu(contrato_id, capitulo, it)) AS c5,
        public.dash_costo_agregado(ap_q6, public._dash_listado_vu(contrato_id, capitulo, it)) AS c6,
        public.dash_costo_agregado(nr_q3, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr3,
        public.dash_costo_agregado(nr_q4, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr4,
        public.dash_costo_agregado(nr_q5, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr5,
        public.dash_costo_agregado(nr_q6, public._dash_listado_vu(contrato_id, capitulo, it)) AS nr6
    FROM item_agg
),
cap_cob AS (
    SELECT
        contrato_id,
        capitulo,
        SUM(c1) AS cobrado_nivel1,
        SUM(c2) AS cobrado_nivel2,
        SUM(c3) AS cobrado_nivel3,
        SUM(c4) AS cobrado_nivel4,
        SUM(c5) AS cobrado_nivel5,
        SUM(c6) AS cobrado_nivel6,
        SUM(nr3) AS no_revisado_nivel3,
        SUM(nr4) AS no_revisado_nivel4,
        SUM(nr5) AS no_revisado_nivel5,
        SUM(nr6) AS no_revisado_nivel6
    FROM item_cost
    GROUP BY contrato_id, capitulo
),
cap_reg_stats AS (
    SELECT
        contrato_id,
        capitulo,
        COUNT(*)::bigint AS total_registros,
        COALESCE(SUM(cd), 0)::numeric AS total_costo
    FROM regs
    GROUP BY contrato_id, capitulo
)
SELECT
    c.contrato_id,
    c.capitulo,
    COALESCE(rs.total_registros, 0)::bigint AS total_registros,
    COALESCE(rs.total_costo, 0)::numeric AS total_costo,
    COALESCE(c.cobrado_nivel1, 0)::numeric AS cobrado_nivel1,
    COALESCE(c.cobrado_nivel2, 0)::numeric AS cobrado_nivel2,
    COALESCE(c.cobrado_nivel3, 0)::numeric AS cobrado_nivel3,
    COALESCE(c.cobrado_nivel4, 0)::numeric AS cobrado_nivel4,
    COALESCE(c.cobrado_nivel5, 0)::numeric AS cobrado_nivel5,
    COALESCE(c.cobrado_nivel6, 0)::numeric AS cobrado_nivel6,
    COALESCE(c.no_revisado_nivel3, 0)::numeric AS no_revisado_nivel3,
    COALESCE(c.no_revisado_nivel4, 0)::numeric AS no_revisado_nivel4,
    COALESCE(c.no_revisado_nivel5, 0)::numeric AS no_revisado_nivel5,
    COALESCE(c.no_revisado_nivel6, 0)::numeric AS no_revisado_nivel6
FROM cap_cob c
LEFT JOIN cap_reg_stats rs USING (contrato_id, capitulo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_dashboard_resumen_cap
    ON public.vm_dashboard_resumen (contrato_id, capitulo);
CREATE INDEX IF NOT EXISTS idx_vm_dashboard_resumen_contrato
    ON public.vm_dashboard_resumen (contrato_id);

-- â”€â”€ 3b. Cobro SICOE aprobado por acta RPO (panel Obra por Acta) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE MATERIALIZED VIEW public.vm_dashboard_por_acta AS
WITH regs AS (
    SELECT
        r.contrato_id,
        r.acta_rpo_id AS aid,
        public._dash_norm_capitulo_key(
            CASE
                WHEN r.capitulo IS NULL OR btrim(r.capitulo::text) = '' THEN 'Sin capÃ­tulo'
                ELSE r.capitulo::text
            END
        ) AS cap,
        public._dash_norm_item_key(r.item_numero) AS it,
        round(COALESCE(r.cantidad_total, 0)::numeric, 2) AS cq,
        public._dash_matriz_nivel_max_estado('nivel1_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax1,
        public._dash_matriz_nivel_max_estado('nivel2_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax2,
        public._dash_matriz_nivel_max_estado('nivel3_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax3,
        public._dash_matriz_nivel_max_estado('nivel4_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax4,
        public._dash_matriz_nivel_max_estado('nivel5_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax5,
        public._dash_matriz_nivel_max_estado('nivel6_estado', r.nivel1_estado, r.nivel2_estado, r.nivel3_estado, r.nivel4_estado, r.nivel5_estado, r.nivel6_estado) AS nmax6
    FROM public.so_registros r
    WHERE r.acta_rpo_id IS NOT NULL
),
item_agg AS (
    SELECT
        contrato_id,
        aid,
        cap,
        it,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax1 = 'Aprobado') AS ap_q1,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax2 = 'Aprobado') AS ap_q2,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax3 = 'Aprobado') AS ap_q3,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax4 = 'Aprobado') AS ap_q4,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax5 = 'Aprobado') AS ap_q5,
        SUM(cq) FILTER (WHERE it IS NOT NULL AND nmax6 = 'Aprobado') AS ap_q6
    FROM regs
    WHERE it IS NOT NULL
    GROUP BY contrato_id, aid, cap, it
),
item_cost AS (
    SELECT
        contrato_id,
        aid,
        public.dash_costo_agregado(ap_q1, public._dash_listado_vu(contrato_id, cap, it)) AS c1,
        public.dash_costo_agregado(ap_q2, public._dash_listado_vu(contrato_id, cap, it)) AS c2,
        public.dash_costo_agregado(ap_q3, public._dash_listado_vu(contrato_id, cap, it)) AS c3,
        public.dash_costo_agregado(ap_q4, public._dash_listado_vu(contrato_id, cap, it)) AS c4,
        public.dash_costo_agregado(ap_q5, public._dash_listado_vu(contrato_id, cap, it)) AS c5,
        public.dash_costo_agregado(ap_q6, public._dash_listado_vu(contrato_id, cap, it)) AS c6
    FROM item_agg
)
SELECT
    contrato_id,
    aid AS acta_rpo_id,
    COALESCE(SUM(c1), 0)::numeric AS cobrado_nivel1,
    COALESCE(SUM(c2), 0)::numeric AS cobrado_nivel2,
    COALESCE(SUM(c3), 0)::numeric AS cobrado_nivel3,
    COALESCE(SUM(c4), 0)::numeric AS cobrado_nivel4,
    COALESCE(SUM(c5), 0)::numeric AS cobrado_nivel5,
    COALESCE(SUM(c6), 0)::numeric AS cobrado_nivel6
FROM item_cost
GROUP BY contrato_id, aid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_dashboard_por_acta
    ON public.vm_dashboard_por_acta (contrato_id, acta_rpo_id);
CREATE INDEX IF NOT EXISTS idx_vm_dashboard_por_acta_contrato
    ON public.vm_dashboard_por_acta (contrato_id);

-- â”€â”€ 4. Refresco (CONCURRENTLY requiere Ã­ndices UNIQUE arriba) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.refresh_vm_sicoe_grilla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_grilla;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_vm_sicoe_registro_detalle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_sicoe_registro_detalle;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_vm_dashboard_resumen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_resumen;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vm_dashboard_por_acta;
    RETURN NULL;
END;
$$;

-- Triggers sÃ­ncronos desactivados: cada INSERT/UPDATE/DELETE refrescaba hasta 4 MV (~3â€“8 s c/u).
-- Refresco batch vÃ­a refresh_all_sicoe_materialized_views() + pg_cron (fix_performance_so_registros_fase1.sql).
DROP TRIGGER IF EXISTS trg_refresh_grilla_reportes ON public.so_reportes;
DROP TRIGGER IF EXISTS trg_refresh_grilla_registros ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_registro_detalle ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_dashboard ON public.so_registros;

-- Carga inicial
REFRESH MATERIALIZED VIEW public.vm_sicoe_registro_detalle;
REFRESH MATERIALIZED VIEW public.vm_sicoe_grilla;
REFRESH MATERIALIZED VIEW public.vm_dashboard_resumen;
REFRESH MATERIALIZED VIEW public.vm_dashboard_por_acta;

GRANT SELECT ON public.vm_sicoe_grilla TO authenticated, service_role;
GRANT SELECT ON public.vm_sicoe_registro_detalle TO authenticated, service_role;
GRANT SELECT ON public.vm_dashboard_resumen TO authenticated, service_role;
GRANT SELECT ON public.vm_dashboard_por_acta TO authenticated, service_role;

-- â”€â”€ 5. Realtime publication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Postgres NO admite materialized views en supabase_realtime.
-- El front escucha so_reportes / so_registros; las MV se refrescan por cron (no por trigger sÃ­ncrono).
-- Ver backend/sql/realtime_publication_tables.sql

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cad_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON MATERIALIZED VIEW public.vm_sicoe_grilla IS 'Grilla SICOE Obra: agregados por reporte; Realtime + API /reportes/buscar.';
COMMENT ON MATERIALIZED VIEW public.vm_sicoe_registro_detalle IS 'Detalle registro para Realtime carpeta abierta.';
COMMENT ON MATERIALIZED VIEW public.vm_dashboard_resumen IS 'Resumen SICOE por capÃ­tulo: cobrado = Î£ Ã­tem dash_costo_agregado(Î£ cant, V.U.); no SUM(costo_directo).';

