-- ClaraCore — Diagnóstico SOLO LECTURA: posibles entradas duplicadas.
-- No modifica datos permanentes. Ejecutar completo en Supabase SQL Editor.
-- Tolerancia de saldo en la app: 0.0001.
-- Devuelve UNA sola tabla (columna "consulta") aunque falten columnas/tablas opcionales.

DROP TABLE IF EXISTS _almacen_diag_dup;

CREATE TEMP TABLE _almacen_diag_dup (
  consulta text,
  contrato_id integer,
  remision text,
  proveedor_clave text,
  proveedor_nombre text,
  n integer,
  codigos text,
  entrada_ids text,
  primera timestamptz,
  ultima timestamptz
);

DO $$
DECLARE
  has_prov_nombre boolean;
  has_soporte_hash boolean;
  has_codigo boolean;
  has_numero_entrada boolean;
  cod_expr text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'almacen_entrada'
      AND column_name = 'proveedor_nombre_texto'
  ) INTO has_prov_nombre;

  SELECT to_regclass('public.almacen_entrada_soporte_hash') IS NOT NULL
    INTO has_soporte_hash;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'almacen_entrada'
      AND column_name = 'codigo'
  ) INTO has_codigo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'almacen_entrada'
      AND column_name = 'numero_entrada'
  ) INTO has_numero_entrada;

  IF has_codigo AND has_numero_entrada THEN
    cod_expr := 'coalesce(nullif(btrim(e.codigo), ''''), ''num-'' || coalesce(e.numero_entrada::text, e.id::text))';
  ELSIF has_codigo THEN
    cod_expr := 'coalesce(nullif(btrim(e.codigo), ''''), e.id::text)';
  ELSIF has_numero_entrada THEN
    cod_expr := '''num-'' || coalesce(e.numero_entrada::text, e.id::text)';
  ELSE
    cod_expr := 'e.id::text';
  END IF;

  -- 1) Remisión + proveedor_id
  EXECUTE format($q$
    INSERT INTO _almacen_diag_dup
    SELECT
      '1_remision_proveedor_id',
      e.contrato_id,
      upper(btrim(e.numero_documento)),
      e.proveedor_id::text,
      coalesce(p.razon_social, ''),
      count(*)::int,
      string_agg(%s, ', ' ORDER BY e.id),
      string_agg(e.id::text, ', ' ORDER BY e.id),
      min(e.created_at),
      max(e.created_at)
    FROM public.almacen_entrada e
    LEFT JOIN public.almacen_proveedor p ON p.id = e.proveedor_id
    WHERE coalesce(e.tipo, 'recibo') = 'recibo'
      AND nullif(btrim(e.numero_documento), '') IS NOT NULL
      AND e.proveedor_id IS NOT NULL
    GROUP BY e.contrato_id, upper(btrim(e.numero_documento)), e.proveedor_id, p.razon_social
    HAVING count(*) > 1
  $q$, cod_expr);

  -- 2) Remisión + proveedor_nombre_texto (si existe la columna)
  IF has_prov_nombre THEN
    EXECUTE format($q$
      INSERT INTO _almacen_diag_dup
      SELECT
        '2_remision_proveedor_nombre',
        e.contrato_id,
        upper(btrim(e.numero_documento)),
        lower(btrim(e.proveedor_nombre_texto)),
        coalesce(e.proveedor_nombre_texto, ''),
        count(*)::int,
        string_agg(%s, ', ' ORDER BY e.id),
        string_agg(e.id::text, ', ' ORDER BY e.id),
        min(e.created_at),
        max(e.created_at)
      FROM public.almacen_entrada e
      WHERE coalesce(e.tipo, 'recibo') = 'recibo'
        AND nullif(btrim(e.numero_documento), '') IS NOT NULL
        AND e.proveedor_id IS NULL
        AND nullif(btrim(coalesce(e.proveedor_nombre_texto, '')), '') IS NOT NULL
      GROUP BY e.contrato_id, upper(btrim(e.numero_documento)),
               lower(btrim(e.proveedor_nombre_texto)), e.proveedor_nombre_texto
      HAVING count(*) > 1
    $q$, cod_expr);
  ELSE
    RAISE NOTICE 'Columna proveedor_nombre_texto ausente: se omite consulta 2.';
  END IF;

  -- 3) Soportes con el mismo content_hash (si existe la tabla)
  IF has_soporte_hash THEN
    INSERT INTO _almacen_diag_dup
    SELECT
      '3_soportes_mismo_hash',
      h.contrato_id,
      left(h.content_hash, 16),
      coalesce(h.tipo_soporte, ''),
      '',
      count(*)::int,
      string_agg(DISTINCT coalesce(nullif(btrim(h.codigo_entrada), ''), h.entrada_id::text), ', '),
      string_agg(DISTINCT h.entrada_id::text, ', '),
      min(h.created_at),
      max(h.created_at)
    FROM public.almacen_entrada_soporte_hash h
    GROUP BY h.contrato_id, h.content_hash, h.tipo_soporte
    HAVING count(*) > 1;
  ELSE
    RAISE NOTICE 'Tabla almacen_entrada_soporte_hash ausente: se omite consulta 3.';
  END IF;
END $$;

SELECT * FROM _almacen_diag_dup
ORDER BY consulta, n DESC, contrato_id;

-- Si no hay filas: no hay duplicados detectados (o no aplica aún el índice único).
