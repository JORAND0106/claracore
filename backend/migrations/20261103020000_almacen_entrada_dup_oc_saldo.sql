-- Duplicados de entrada, umbrales de saldo OC y avisos one-shot a Validar.

-- 1) Clave de idempotencia por intento de registro (anti doble envío).
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_idempotency
  ON public.almacen_entrada (contrato_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

COMMENT ON COLUMN public.almacen_entrada.idempotency_key IS
  'Identificador único del intento de registro (cliente). Evita entradas duplicadas por doble toque o reintento.';

-- 2) Unicidad lógica remisión + proveedor (recibo).
-- Si ya hay duplicados, omite el índice con NOTICE (no aborta la migración).
DO $$
DECLARE
  n_dup_id integer := 0;
  n_dup_nom integer := 0;
BEGIN
  SELECT count(*) INTO n_dup_id
  FROM (
    SELECT 1
    FROM public.almacen_entrada e
    WHERE e.tipo = 'recibo'
      AND e.proveedor_id IS NOT NULL
      AND nullif(btrim(e.numero_documento), '') IS NOT NULL
    GROUP BY e.contrato_id, upper(btrim(e.numero_documento)), e.proveedor_id
    HAVING count(*) > 1
  ) d;

  IF n_dup_id = 0 THEN
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_remision_proveedor_id
        ON public.almacen_entrada (contrato_id, upper(btrim(numero_documento)), proveedor_id)
        WHERE tipo = 'recibo'
          AND numero_documento IS NOT NULL
          AND btrim(numero_documento) <> ''
          AND proveedor_id IS NOT NULL
    $idx$;
  ELSE
    RAISE NOTICE
      'OMITIDO uq_almacen_entrada_remision_proveedor_id: % grupos duplicados. Ejecute almacen_diagnostico_entradas_duplicadas.sql.',
      n_dup_id;
  END IF;

  SELECT count(*) INTO n_dup_nom
  FROM (
    SELECT 1
    FROM public.almacen_entrada e
    WHERE e.tipo = 'recibo'
      AND e.proveedor_id IS NULL
      AND nullif(btrim(e.numero_documento), '') IS NOT NULL
      AND nullif(btrim(e.proveedor_nombre_texto), '') IS NOT NULL
    GROUP BY e.contrato_id, upper(btrim(e.numero_documento)), lower(btrim(e.proveedor_nombre_texto))
    HAVING count(*) > 1
  ) d;

  IF n_dup_nom = 0 THEN
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_entrada_remision_proveedor_nombre
        ON public.almacen_entrada (
          contrato_id,
          upper(btrim(numero_documento)),
          lower(btrim(proveedor_nombre_texto))
        )
        WHERE tipo = 'recibo'
          AND numero_documento IS NOT NULL
          AND btrim(numero_documento) <> ''
          AND proveedor_id IS NULL
          AND proveedor_nombre_texto IS NOT NULL
          AND btrim(proveedor_nombre_texto) <> ''
    $idx$;
  ELSE
    RAISE NOTICE
      'OMITIDO uq_almacen_entrada_remision_proveedor_nombre: % grupos duplicados.',
      n_dup_nom;
  END IF;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'Columna ausente al crear índices de remisión; se omite. Aplique scripts previos de entrada.';
END $$;

-- 3) Umbrales de alerta de saldo OC (configuración por contrato).
-- ADD + backfill + DEFAULT/NOT NULL + CHECK nombrados (idempotente en re-ejecución).
ALTER TABLE public.almacen_config
  ADD COLUMN IF NOT EXISTS alerta_saldo_amarillo_pct numeric(5, 2);

ALTER TABLE public.almacen_config
  ADD COLUMN IF NOT EXISTS alerta_saldo_rojo_pct numeric(5, 2);

UPDATE public.almacen_config
SET alerta_saldo_amarillo_pct = 20
WHERE alerta_saldo_amarillo_pct IS NULL;

UPDATE public.almacen_config
SET alerta_saldo_rojo_pct = 5
WHERE alerta_saldo_rojo_pct IS NULL;

ALTER TABLE public.almacen_config
  ALTER COLUMN alerta_saldo_amarillo_pct SET DEFAULT 20;

ALTER TABLE public.almacen_config
  ALTER COLUMN alerta_saldo_rojo_pct SET DEFAULT 5;

DO $$
BEGIN
  ALTER TABLE public.almacen_config
    ALTER COLUMN alerta_saldo_amarillo_pct SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'alerta_saldo_amarillo_pct NOT NULL: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.almacen_config
    ALTER COLUMN alerta_saldo_rojo_pct SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'alerta_saldo_rojo_pct NOT NULL: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'almacen_config_alerta_saldo_amarillo_pct_check'
  ) THEN
    ALTER TABLE public.almacen_config
      ADD CONSTRAINT almacen_config_alerta_saldo_amarillo_pct_check
      CHECK (alerta_saldo_amarillo_pct > 0 AND alerta_saldo_amarillo_pct <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'almacen_config_alerta_saldo_rojo_pct_check'
  ) THEN
    ALTER TABLE public.almacen_config
      ADD CONSTRAINT almacen_config_alerta_saldo_rojo_pct_check
      CHECK (alerta_saldo_rojo_pct > 0 AND alerta_saldo_rojo_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.almacen_config.alerta_saldo_amarillo_pct IS
  'Umbral amarillo: saldo restante de la OC ≤ este % de lo pedido (default 20).';
COMMENT ON COLUMN public.almacen_config.alerta_saldo_rojo_pct IS
  'Umbral rojo: saldo restante de la OC ≤ este % de lo pedido (default 5).';

-- 4) Una sola notificación por umbral cruzado (por línea de OC).
CREATE TABLE IF NOT EXISTS public.almacen_oc_item_alerta_enviada (
  orden_compra_item_id bigint NOT NULL
    REFERENCES public.almacen_orden_compra_item(id) ON DELETE CASCADE,
  umbral text NOT NULL CHECK (umbral IN ('amarillo', 'rojo')),
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (orden_compra_item_id, umbral)
);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_item_alerta_contrato
  ON public.almacen_oc_item_alerta_enviada (contrato_id);

COMMENT ON TABLE public.almacen_oc_item_alerta_enviada IS
  'Registro de avisos a Validar por umbral de saldo OC ya enviados (no repetir).';

-- 5) RPC: OC con saldo incluye insumos consumidos (marcados) para bloquearlos en UI.
CREATE OR REPLACE FUNCTION public.almacen_ocs_pendientes_tarjeta(p_contrato_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH ocs AS (
    SELECT
      oc.id,
      oc.numero_oc,
      oc.proveedor_id,
      oc.proveedor_nombre,
      oc.solicitud_id,
      oc.created_at
    FROM public.almacen_orden_compra oc
    WHERE oc.contrato_id = p_contrato_id
      AND oc.estado IS DISTINCT FROM 'anulada'
  ),
  items AS (
    SELECT
      oci.id AS orden_compra_item_id,
      oci.orden_compra_id,
      oci.solicitud_item_id,
      oci.material_descripcion,
      oci.unidad,
      COALESCE(oci.cantidad, 0) AS cantidad_pedida,
      GREATEST(0::numeric, COALESCE(oci.cantidad, 0) - COALESCE(oci.cantidad_recibida, 0)) AS saldo_cantidad,
      GREATEST(
        0::numeric,
        (COALESCE(oci.cantidad, 0) * COALESCE(oci.valor_unitario, 0))
          - COALESCE(oci.valor_recibido, 0)
      ) AS saldo_valor
    FROM public.almacen_orden_compra_item oci
    INNER JOIN ocs ON ocs.id = oci.orden_compra_id
  ),
  oc_con_saldo AS (
    SELECT DISTINCT orden_compra_id
    FROM items
    WHERE saldo_cantidad > 0.0001
  ),
  pending AS (
    SELECT i.*
    FROM items i
    INNER JOIN oc_con_saldo ocsaldo ON ocsaldo.orden_compra_id = i.orden_compra_id
  ),
  sol_items AS (
    SELECT
      si.id,
      si.insumo_id,
      si.pk_id,
      si.tramo,
      si.costado,
      si.abscisa_inicial,
      si.abscisa_final,
      si.material_descripcion AS sol_material,
      si.unidad AS sol_unidad
    FROM public.almacen_solicitud_item si
    WHERE si.id IN (
      SELECT DISTINCT p.solicitud_item_id FROM pending p WHERE p.solicitud_item_id IS NOT NULL
    )
  ),
  enriched AS (
    SELECT
      p.orden_compra_item_id,
      p.orden_compra_id,
      p.cantidad_pedida,
      p.saldo_cantidad,
      p.saldo_valor,
      COALESCE(si.insumo_id, NULL) AS insumo_id,
      COALESCE(
        NULLIF(TRIM(p.material_descripcion), ''),
        NULLIF(TRIM(si.sol_material), ''),
        'Material'
      ) AS mat_label,
      COALESCE(
        NULLIF(TRIM(p.unidad), ''),
        NULLIF(TRIM(si.sol_unidad), ''),
        'UND'
      ) AS und_label,
      si.pk_id,
      si.tramo,
      si.costado,
      si.abscisa_inicial,
      si.abscisa_final,
      CASE
        WHEN si.insumo_id IS NOT NULL THEN 'i:' || si.insumo_id::text
        ELSE 'd:' || lower(trim(both FROM COALESCE(
               NULLIF(TRIM(p.material_descripcion), ''),
               NULLIF(TRIM(si.sol_material), ''),
               'material'
             )))
             || '|' || lower(trim(both FROM COALESCE(
               NULLIF(TRIM(p.unidad), ''),
               NULLIF(TRIM(si.sol_unidad), ''),
               'und'
             )))
      END AS insumo_key
    FROM pending p
    LEFT JOIN sol_items si ON si.id = p.solicitud_item_id
  ),
  by_insumo AS (
    SELECT
      e.orden_compra_id,
      e.insumo_key,
      (array_agg(e.insumo_id) FILTER (WHERE e.insumo_id IS NOT NULL))[1] AS insumo_id,
      MIN(e.mat_label) AS material_descripcion,
      MIN(e.und_label) AS unidad,
      ROUND(SUM(e.saldo_cantidad)::numeric, 4) AS saldo_cantidad,
      ROUND(SUM(e.saldo_valor)::numeric, 2) AS saldo_valor,
      ROUND(SUM(e.cantidad_pedida)::numeric, 4) AS cantidad_pedida,
      (SUM(e.saldo_cantidad) <= 0.0001) AS consumido,
      (array_agg(e.pk_id) FILTER (WHERE e.pk_id IS NOT NULL))[1] AS pk_id,
      (array_agg(e.tramo) FILTER (WHERE e.tramo IS NOT NULL))[1] AS tramo,
      (array_agg(e.costado) FILTER (WHERE e.costado IS NOT NULL))[1] AS costado,
      (array_agg(e.abscisa_inicial) FILTER (WHERE e.abscisa_inicial IS NOT NULL))[1] AS abscisa_inicial,
      (array_agg(e.abscisa_final) FILTER (WHERE e.abscisa_final IS NOT NULL))[1] AS abscisa_final,
      jsonb_agg(
        jsonb_build_object(
          'orden_compra_item_id', e.orden_compra_item_id,
          'saldo_cantidad', ROUND(e.saldo_cantidad::numeric, 4),
          'cantidad_pedida', ROUND(e.cantidad_pedida::numeric, 4),
          'pk_id', e.pk_id
        )
        ORDER BY e.orden_compra_item_id
      ) FILTER (WHERE e.saldo_cantidad > 0.0001) AS lineas
    FROM enriched e
    GROUP BY e.orden_compra_id, e.insumo_key
  ),
  cards AS (
    SELECT
      oc.id AS orden_compra_id,
      oc.numero_oc,
      oc.proveedor_id,
      COALESCE(NULLIF(TRIM(oc.proveedor_nombre), ''), NULLIF(TRIM(prov.razon_social), ''), '') AS proveedor_nombre,
      oc.solicitud_id,
      sol.consecutivo AS solicitud_consecutivo,
      sol.titulo AS solicitud_titulo,
      oc.created_at,
      ROUND(SUM(bi.saldo_cantidad)::numeric, 4) AS saldo_cantidad_total,
      CASE
        WHEN bool_or(bi.consumido) OR MIN(
          CASE WHEN bi.cantidad_pedida > 0.0001
            THEN (bi.saldo_cantidad / bi.cantidad_pedida) * 100
            ELSE 100 END
        ) <= 5 THEN 'rojo'
        WHEN MIN(
          CASE WHEN bi.cantidad_pedida > 0.0001
            THEN (bi.saldo_cantidad / bi.cantidad_pedida) * 100
            ELSE 100 END
        ) <= 20 THEN 'amarillo'
        ELSE 'normal'
      END AS alerta_agotamiento,
      jsonb_agg(
        jsonb_build_object(
          'key', bi.insumo_key,
          'insumo_id', bi.insumo_id,
          'material_descripcion', bi.material_descripcion,
          'unidad', bi.unidad,
          'saldo_cantidad', bi.saldo_cantidad,
          'saldo_valor', bi.saldo_valor,
          'cantidad_pedida', bi.cantidad_pedida,
          'consumido', bi.consumido,
          'pk_id', bi.pk_id,
          'tramo', bi.tramo,
          'costado', bi.costado,
          'abscisa_inicial', bi.abscisa_inicial,
          'abscisa_final', bi.abscisa_final,
          'lineas', COALESCE(bi.lineas, '[]'::jsonb)
        )
        ORDER BY bi.consumido, bi.material_descripcion
      ) AS insumos
    FROM ocs oc
    INNER JOIN by_insumo bi ON bi.orden_compra_id = oc.id
    LEFT JOIN public.almacen_proveedor prov ON prov.id = oc.proveedor_id
    LEFT JOIN public.almacen_solicitud sol ON sol.id = oc.solicitud_id
    GROUP BY
      oc.id, oc.numero_oc, oc.proveedor_id, oc.proveedor_nombre, oc.solicitud_id,
      prov.razon_social, sol.consecutivo, sol.titulo, oc.created_at
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'orden_compra_id', c.orden_compra_id,
          'numero_oc', c.numero_oc,
          'proveedor_id', c.proveedor_id,
          'proveedor_nombre', c.proveedor_nombre,
          'solicitud_id', c.solicitud_id,
          'solicitud_consecutivo', c.solicitud_consecutivo,
          'solicitud_titulo', c.solicitud_titulo,
          'saldo_cantidad_total', c.saldo_cantidad_total,
          'alerta_agotamiento', c.alerta_agotamiento,
          'insumos', c.insumos
        )
        ORDER BY c.created_at DESC
      )
      FROM cards c
    ),
    '[]'::jsonb
  );
$$;

COMMENT ON FUNCTION public.almacen_ocs_pendientes_tarjeta(integer) IS
  'Tarjetas OC con saldo; insumos consumidos incluidos (consumido=true) para bloquearlos en captura.';

NOTIFY pgrst, 'reload schema';
