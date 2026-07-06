-- =============================================================================
-- Migración: contrato_licencia_cobro_config — autorizador y correos
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto ClaraCore).
-- Corrige: PGRST204 "Could not find the 'autorizo_usuario_id' column..."
--
-- Columnas que usa la API al guardar configuración de cobro (PUT .../config):
--   • autorizo_usuario_id  → FK al usuario que autoriza (nuevo)
--   • autorizo_nombre      → nombre denormalizado para el PDF (ya existía)
--   • autorizo_cargo       → cargo denormalizado para el PDF (ya existía)
--   • correos_notificacion → lista JSON de correos (nuevo)
--
-- Tras ejecutar: guarde de nuevo la configuración en Órdenes de pago y genere
-- una orden; el bloque "Autorizó" del PDF tomará nombre y cargo guardados.
-- =============================================================================

-- 1) Columnas nuevas (idempotente)
ALTER TABLE public.contrato_licencia_cobro_config
  ADD COLUMN IF NOT EXISTS autorizo_usuario_id integer
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.contrato_licencia_cobro_config
  ADD COLUMN IF NOT EXISTS autorizo_nombre text;

ALTER TABLE public.contrato_licencia_cobro_config
  ADD COLUMN IF NOT EXISTS autorizo_cargo text;

ALTER TABLE public.contrato_licencia_cobro_config
  ADD COLUMN IF NOT EXISTS correos_notificacion jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Asegurar default en filas existentes (por si la columna ya existía sin default)
UPDATE public.contrato_licencia_cobro_config
SET correos_notificacion = '[]'::jsonb
WHERE correos_notificacion IS NULL;

-- 3) Comentarios
COMMENT ON COLUMN public.contrato_licencia_cobro_config.autorizo_usuario_id IS
  'Usuario de la plataforma que autoriza órdenes de pago (nombre/cargo denormalizados en autorizo_nombre/autorizo_cargo).';

COMMENT ON COLUMN public.contrato_licencia_cobro_config.autorizo_nombre IS
  'Nombre completo del autorizador en el PDF (copiado del usuario al guardar).';

COMMENT ON COLUMN public.contrato_licencia_cobro_config.autorizo_cargo IS
  'Cargo del autorizador en el PDF (copiado del usuario al guardar).';

COMMENT ON COLUMN public.contrato_licencia_cobro_config.correos_notificacion IS
  'Lista JSON de correos para envío futuro de órdenes de pago. Ej: ["facturacion@empresa.co"].';

-- 4) Recargar caché de esquema PostgREST (evita PGRST204 tras ALTER)
NOTIFY pgrst, 'reload schema';

-- 5) Verificación (debe listar las 4 columnas)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contrato_licencia_cobro_config'
  AND column_name IN (
    'autorizo_usuario_id',
    'autorizo_nombre',
    'autorizo_cargo',
    'correos_notificacion'
  )
ORDER BY column_name;
