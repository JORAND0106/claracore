-- Diagnóstico: plantillas de reporte sin creador identificable.
-- No modifica datos. Ejecutar en Supabase para el informe del ticket.
-- Tras el cambio de alcance personal, estas filas no aparecen a ningún usuario
-- (se conservan en BD; no se eliminan ni se reasignan).

SELECT
  id,
  contrato_id,
  capitulo,
  nombre,
  creado_por
FROM public.so_plantillas
WHERE creado_por IS NULL
   OR creado_por = 0
ORDER BY contrato_id, capitulo, id;

SELECT COUNT(*) AS plantillas_sin_creador
FROM public.so_plantillas
WHERE creado_por IS NULL
   OR creado_por = 0;
