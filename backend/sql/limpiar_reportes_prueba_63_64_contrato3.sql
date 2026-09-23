-- =============================================================================
-- Limpieza IRREVERSIBLE — reportes de prueba SICOE #63 y #64 (contrato_id = 3)
--
-- Contexto (inspección 2026-09-23):
--   • #64 existe: so_reportes.id = 37036
--       «FILTRO Tramo 8 entre k2+975 a k2+999», estado Sin Asignar Ítem
--       5 so_registros (numeros 366–370), sin comentarios, sin puntos topo
--   • #63 NO existe hoy en contrato 3 (hueco 62–63; max real previo = 61)
--   • NO tocar contrato 2: allí #63/#64 son reportes reales «Aprobados» (abril 2026)
--
-- Numeración: siguiente_numero_reporte = GREATEST(MAX(numero)+1, reservado_hasta+1).
-- Tras borrar #64, MAX queda en 61 → el siguiente natural sería 62.
-- Este script fija reservado_hasta = 62 para que el próximo número sea 63
-- (tal como pidió la limpieza de pruebas).
--
-- Ejecutar en Supabase SQL Editor (rol postgres / service_role). Revisar el
-- bloque de diagnóstico; luego descomentar la sección APPLY.
-- =============================================================================

-- ── 1) Diagnóstico (solo lectura) ────────────────────────────────────────────
SELECT id, numero_reporte, estado, descripcion_actividad, created_at, creado_por
FROM public.so_reportes
WHERE contrato_id = 3 AND numero_reporte IN (63, 64)
ORDER BY numero_reporte;

SELECT r.id, r.reporte_id, r.numero_registro, r.observacion, r.cantidad_total,
       r.foto_url IS NOT NULL AS tiene_foto,
       r.grafico_url IS NOT NULL AS tiene_grafico
FROM public.so_registros r
JOIN public.so_reportes p ON p.id = r.reporte_id
WHERE p.contrato_id = 3 AND p.numero_reporte IN (63, 64)
ORDER BY r.numero_registro;

SELECT *
FROM public.so_puntos_topograficos
WHERE contrato_id = 3
  AND reporte_id IN (
    SELECT id FROM public.so_reportes
    WHERE contrato_id = 3 AND numero_reporte IN (63, 64)
  );

SELECT contrato_id, reservado_hasta
FROM public.sico_ultimo_numero_reporte
WHERE contrato_id = 3;

SELECT COALESCE(MAX(numero_reporte), 0) AS max_reporte_actual
FROM public.so_reportes
WHERE contrato_id = 3;

-- ── 2) APPLY (descomentar para ejecutar) ─────────────────────────────────────
/*
BEGIN;

CREATE TEMP TABLE _targets_rep ON COMMIT DROP AS
SELECT id, numero_reporte
FROM public.so_reportes
WHERE contrato_id = 3 AND numero_reporte IN (63, 64);

CREATE TEMP TABLE _targets_reg ON COMMIT DROP AS
SELECT id, numero_registro, reporte_id
FROM public.so_registros
WHERE contrato_id = 3
  AND reporte_id IN (SELECT id FROM _targets_rep);

-- Comentarios de registros (si hay)
DELETE FROM public.so_registro_comentarios
WHERE registro_id IN (SELECT id FROM _targets_reg);

-- Registros
DELETE FROM public.so_registros
WHERE contrato_id = 3
  AND id IN (SELECT id FROM _targets_reg);

-- Coordenadas topográficas
DELETE FROM public.so_puntos_topograficos
WHERE contrato_id = 3
  AND reporte_id IN (SELECT id FROM _targets_rep);

-- Cabeceras
DELETE FROM public.so_reportes
WHERE contrato_id = 3
  AND id IN (SELECT id FROM _targets_rep);

-- Quitar vínculos en planillas de tubería (meta_cabecera.sicoe_reportes)
UPDATE public.topo_planillas_tuberia p
SET
  meta_cabecera = jsonb_set(
    COALESCE(p.meta_cabecera, '{}'::jsonb),
    '{sicoe_reportes}',
    (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(
        COALESCE(p.meta_cabecera->'sicoe_reportes', '[]'::jsonb)
      ) AS elem
      WHERE NOT (
        COALESCE((elem->>'numero_reporte')::int, -1) IN (63, 64)
        OR COALESCE((elem->>'reporte_id')::bigint, -1) IN (
          SELECT id FROM _targets_rep
        )
      )
    )
  ),
  updated_at = now()
WHERE p.contrato_id = 3
  AND p.meta_cabecera ? 'sicoe_reportes'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(p.meta_cabecera->'sicoe_reportes', '[]'::jsonb)
    ) AS elem
    WHERE COALESCE((elem->>'numero_reporte')::int, -1) IN (63, 64)
       OR COALESCE((elem->>'reporte_id')::bigint, -1) IN (
         SELECT id FROM _targets_rep
       )
  );

-- Contador de reportes → próximo = 63
INSERT INTO public.sico_ultimo_numero_reporte (contrato_id, reservado_hasta)
VALUES (3, 62)
ON CONFLICT (contrato_id) DO UPDATE
SET reservado_hasta = EXCLUDED.reservado_hasta;

-- Contador de registros → próximo = MAX restante + 1
INSERT INTO public.sico_ultimo_numero_registro (contrato_id, reservado_hasta)
VALUES (
  3,
  (SELECT COALESCE(MAX(numero_registro), 0) FROM public.so_registros WHERE contrato_id = 3)
)
ON CONFLICT (contrato_id) DO UPDATE
SET reservado_hasta = EXCLUDED.reservado_hasta;

-- Verificación en la misma transacción (ROLLBACK al final = no quema el 63)
DO $$
DECLARE
  sig integer;
  max_r integer;
  cnt_other integer;
BEGIN
  SELECT COALESCE(MAX(numero_reporte), 0) INTO max_r
  FROM public.so_reportes WHERE contrato_id = 3;
  IF max_r >= 63 THEN
    RAISE EXCEPTION 'Tras borrado aún hay numero_reporte >= 63 (max=%)', max_r;
  END IF;

  SELECT COUNT(*) INTO cnt_other
  FROM public.so_reportes
  WHERE contrato_id = 3 AND numero_reporte NOT IN (63, 64);
  -- sanity: contrato 3 tenía ~55 reportes; tras borrar 1 quedan ~54
  IF cnt_other < 50 THEN
    RAISE EXCEPTION 'Conteo inesperado de reportes restantes: %', cnt_other;
  END IF;

  sig := public.siguiente_numero_reporte(3);
  IF sig <> 63 THEN
    RAISE EXCEPTION 'Se esperaba siguiente=63, obtuvo %', sig;
  END IF;
  -- Deshacer la reserva del smoke-test
  UPDATE public.sico_ultimo_numero_reporte
  SET reservado_hasta = 62
  WHERE contrato_id = 3;
END $$;

-- Confirmación final
SELECT 'reportes_63_64' AS check, COUNT(*) AS n
FROM public.so_reportes WHERE contrato_id = 3 AND numero_reporte IN (63, 64)
UNION ALL
SELECT 'max_reporte', COALESCE(MAX(numero_reporte), 0)
FROM public.so_reportes WHERE contrato_id = 3
UNION ALL
SELECT 'reservado_reporte', reservado_hasta
FROM public.sico_ultimo_numero_reporte WHERE contrato_id = 3
UNION ALL
SELECT 'reservado_registro', reservado_hasta
FROM public.sico_ultimo_numero_registro WHERE contrato_id = 3;

COMMIT;
*/
