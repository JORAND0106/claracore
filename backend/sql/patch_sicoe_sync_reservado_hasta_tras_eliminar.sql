-- Sincroniza sico_ultimo_numero_reporte / sico_ultimo_numero_registro con el MAX real
-- por contrato, para que siguiente_numero_reporte/registro reutilice números liberados
-- tras eliminaciones (GREATEST(MAX+1, reservado_hasta+1) deja de "saltar" huecos).
--
-- El backend también llama a esta lógica tras DELETE de reportes/registros
-- (_sincronizar_contador_numero_reporte / _sincronizar_contador_numero_registro).
-- Este script corrige el estado ya desincronizado (p. ej. contrato 3 tras borrar 63–67).
--
-- Idempotente: se puede re-ejecutar.

-- 1) Contrato 3 (caso confirmado: MAX(numero_reporte)=61 → próximo debe ser 62)
UPDATE public.sico_ultimo_numero_reporte u
SET reservado_hasta = COALESCE(
  (SELECT MAX(r.numero_reporte) FROM public.so_reportes r WHERE r.contrato_id = 3),
  0
)
WHERE u.contrato_id = 3;

UPDATE public.sico_ultimo_numero_registro u
SET reservado_hasta = COALESCE(
  (SELECT MAX(s.numero_registro) FROM public.so_registros s WHERE s.contrato_id = 3),
  0
)
WHERE u.contrato_id = 3;

-- 2) Todos los contratos: bajar reservado_hasta si quedó por encima del MAX real
UPDATE public.sico_ultimo_numero_reporte u
SET reservado_hasta = COALESCE(m.max_num, 0)
FROM (
  SELECT contrato_id, MAX(numero_reporte) AS max_num
  FROM public.so_reportes
  GROUP BY contrato_id
) m
WHERE u.contrato_id = m.contrato_id
  AND u.reservado_hasta > COALESCE(m.max_num, 0);

UPDATE public.sico_ultimo_numero_reporte u
SET reservado_hasta = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.so_reportes r WHERE r.contrato_id = u.contrato_id
)
AND u.reservado_hasta > 0;

UPDATE public.sico_ultimo_numero_registro u
SET reservado_hasta = COALESCE(m.max_num, 0)
FROM (
  SELECT contrato_id, MAX(numero_registro) AS max_num
  FROM public.so_registros
  GROUP BY contrato_id
) m
WHERE u.contrato_id = m.contrato_id
  AND u.reservado_hasta > COALESCE(m.max_num, 0);

UPDATE public.sico_ultimo_numero_registro u
SET reservado_hasta = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.so_registros s WHERE s.contrato_id = u.contrato_id
)
AND u.reservado_hasta > 0;

-- Verificación contrato 3
SELECT
  'reporte' AS tipo,
  u.contrato_id,
  u.reservado_hasta,
  (SELECT MAX(r.numero_reporte) FROM public.so_reportes r WHERE r.contrato_id = u.contrato_id) AS max_tabla,
  u.reservado_hasta + 1 AS proximo_esperado
FROM public.sico_ultimo_numero_reporte u
WHERE u.contrato_id = 3
UNION ALL
SELECT
  'registro',
  u.contrato_id,
  u.reservado_hasta,
  (SELECT MAX(s.numero_registro) FROM public.so_registros s WHERE s.contrato_id = u.contrato_id),
  u.reservado_hasta + 1
FROM public.sico_ultimo_numero_registro u
WHERE u.contrato_id = 3;
