-- ============================================================================
-- Listado meta en vivo — columnas backup_1 (presupuesto / so_registros)
-- ============================================================================
-- Ítem, descripción y unidad pasan a resolverse en vivo desde listado_precios
-- (mismo principio que V.U. / _dash_listado_vu). Antes columnas permiten auditar
-- o revertir si hace falta, siguiendo el patrón backup_1 ya usado en vivo.
--
-- ANTES de correr el sync opcional:
--   backend/sql/listado_meta_vivo_verify_and_sync.sql
-- ============================================================================

ALTER TABLE public.presupuesto
  ADD COLUMN IF NOT EXISTS item_backup_1 text,
  ADD COLUMN IF NOT EXISTS descripcion_backup_1 text,
  ADD COLUMN IF NOT EXISTS und_backup_1 text;

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS item_numero_backup_1 text,
  ADD COLUMN IF NOT EXISTS item_descripcion_backup_1 text,
  ADD COLUMN IF NOT EXISTS unidad_backup_1 text;

COMMENT ON COLUMN public.presupuesto.item_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';
COMMENT ON COLUMN public.presupuesto.descripcion_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';
COMMENT ON COLUMN public.presupuesto.und_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';
COMMENT ON COLUMN public.so_registros.item_numero_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';
COMMENT ON COLUMN public.so_registros.item_descripcion_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';
COMMENT ON COLUMN public.so_registros.unidad_backup_1 IS
  'Respaldo pre-migración meta en vivo (listado_precios) — ronda backup_1';

-- Snapshot inicial (idempotente: solo celdas aún NULL)
UPDATE public.presupuesto
SET
  item_backup_1 = COALESCE(item_backup_1, item),
  descripcion_backup_1 = COALESCE(descripcion_backup_1, descripcion),
  und_backup_1 = COALESCE(und_backup_1, und)
WHERE item_backup_1 IS NULL
   OR descripcion_backup_1 IS NULL
   OR und_backup_1 IS NULL;

UPDATE public.so_registros
SET
  item_numero_backup_1 = COALESCE(item_numero_backup_1, item_numero),
  item_descripcion_backup_1 = COALESCE(item_descripcion_backup_1, item_descripcion),
  unidad_backup_1 = COALESCE(unidad_backup_1, unidad)
WHERE item_numero_backup_1 IS NULL
   OR item_descripcion_backup_1 IS NULL
   OR unidad_backup_1 IS NULL;

NOTIFY pgrst, 'reload schema';
