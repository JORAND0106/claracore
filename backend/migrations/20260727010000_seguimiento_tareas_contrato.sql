-- Seguimiento: aislar tareas personales por contrato.
-- La columna contrato_id ya existe en seguimiento_item (usada por compromisos).
-- Este script rellena tareas legacy sin contrato y documenta el índice.

-- 1) Backfill: contrato principal del creador
UPDATE public.seguimiento_item si
SET contrato_id = u.contrato_id,
    updated_at = now()
FROM public.usuarios u
WHERE si.origen = 'tarea'
  AND si.contrato_id IS NULL
  AND si.created_by = u.id
  AND u.contrato_id IS NOT NULL;

-- 2) Backfill: si el creador no tiene contrato principal pero está en
--    exactamente un contrato vía usuario_contratos, usar ese.
UPDATE public.seguimiento_item si
SET contrato_id = uc.contrato_id,
    updated_at = now()
FROM (
  SELECT usuario_id, MIN(contrato_id) AS contrato_id
  FROM public.usuario_contratos
  GROUP BY usuario_id
  HAVING COUNT(*) = 1
) uc
WHERE si.origen = 'tarea'
  AND si.contrato_id IS NULL
  AND si.created_by = uc.usuario_id;

-- 3) Índice de apoyo a bandeja filtrada por contrato + origen
CREATE INDEX IF NOT EXISTS idx_seguimiento_item_contrato_origen_estado
  ON public.seguimiento_item (contrato_id, origen, estado_gestion)
  WHERE contrato_id IS NOT NULL;

COMMENT ON COLUMN public.seguimiento_item.contrato_id IS
  'Contrato al que pertenece el ítem. Obligatorio para compromisos; obligatorio también para tareas nuevas (aislamiento por contrato activo).';
