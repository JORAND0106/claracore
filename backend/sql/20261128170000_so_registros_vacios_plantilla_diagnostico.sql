-- Diagnóstico: registros vacíos típicos de plantilla no diligenciada.
-- No modifica datos. Ejecutar en Supabase por contrato.
-- Criterio: tiene nombre; sin longitud/ancho/espesor/cantidad/cantidad_total;
--           sin observación; sin foto_url.

-- :contrato_id = ID del contrato

SELECT
  r.id,
  r.reporte_id,
  rep.numero_reporte,
  r.numero_registro,
  r.nombre,
  r.capitulo
FROM public.so_registros r
LEFT JOIN public.so_reportes rep ON rep.id = r.reporte_id
WHERE r.contrato_id = :contrato_id
  AND NULLIF(btrim(r.nombre), '') IS NOT NULL
  AND r.longitud IS NULL
  AND r.ancho IS NULL
  AND r.espesor IS NULL
  AND r.cantidad IS NULL
  AND r.cantidad_total IS NULL
  AND (r.observacion IS NULL OR btrim(r.observacion) = '')
  AND (r.foto_url IS NULL OR btrim(r.foto_url) = '')
ORDER BY r.reporte_id, r.numero_registro, r.id;

SELECT COUNT(*) AS registros_vacios_tipo_plantilla
FROM public.so_registros r
WHERE r.contrato_id = :contrato_id
  AND NULLIF(btrim(r.nombre), '') IS NOT NULL
  AND r.longitud IS NULL
  AND r.ancho IS NULL
  AND r.espesor IS NULL
  AND r.cantidad IS NULL
  AND r.cantidad_total IS NULL
  AND (r.observacion IS NULL OR btrim(r.observacion) = '')
  AND (r.foto_url IS NULL OR btrim(r.foto_url) = '');
