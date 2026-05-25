-- Restaurar contrato 3 desde backup (2026-05-24)
-- Ejecutar solo si hay que revertir la carga PK_ID_v0.csv y sync tramo presupuesto.

BEGIN;

-- 1) Restaurar pk_ids
DELETE FROM public.pk_ids WHERE contrato_id = 3;
INSERT INTO public.pk_ids
SELECT * FROM public.pk_ids_backup_c3_20260524;

-- 2) Restaurar tramo en presupuesto
UPDATE public.presupuesto p
SET tramo = b.tramo
FROM public.presupuesto_tramo_backup_c3_20260524 b
WHERE p.id = b.id
  AND p.contrato_id = 3;

COMMIT;

-- Verificación rápida:
-- SELECT COUNT(*) FROM pk_ids WHERE contrato_id = 3;
-- SELECT COUNT(*) FROM presupuesto_tramo_backup_c3_20260524;
