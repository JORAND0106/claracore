-- ClaraCore — RRHH: hora de auditoría en Colombia (America/Bogota)
--
-- Los timestamptz ya guardan el instante absoluto correcto. No hace falta
-- reescribir filas: la app convierte a America/Bogota al mostrar (UI y PDF).
-- Los nuevos registros se serializan con offset -05:00.
--
-- Verificación opcional (solo lectura):

SELECT
  id,
  trabajador_id,
  ejecutado_en AS ejecutado_en_utc_o_offset,
  ejecutado_en AT TIME ZONE 'America/Bogota' AS ejecutado_en_hora_colombia
FROM public.rrhh_auditoria_informes
ORDER BY ejecutado_en DESC
LIMIT 20;

SELECT
  id,
  doc_auditoria_en,
  doc_auditoria_en AT TIME ZONE 'America/Bogota' AS doc_auditoria_hora_colombia
FROM public.rrhh_trabajadores
WHERE doc_auditoria_en IS NOT NULL
ORDER BY doc_auditoria_en DESC
LIMIT 20;
