-- Ejecutar en Supabase SQL Editor (una vez).
-- Amplía la tabla logs para auditoría obra pública: trazabilidad, severidad, errores de sistema.

ALTER TABLE logs ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'auditoria';
COMMENT ON COLUMN logs.categoria IS 'auditoria | sistema';

ALTER TABLE logs ADD COLUMN IF NOT EXISTS severidad text DEFAULT 'INFO';
COMMENT ON COLUMN logs.severidad IS 'INFO | WARNING | ERROR | AUDIT';

ALTER TABLE logs ADD COLUMN IF NOT EXISTS ip text;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS rol_nombre text;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS valor_anterior jsonb;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS valor_nuevo jsonb;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS metodo_http text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS stack_trace text;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS duracion_ms integer;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS alerta_generada boolean DEFAULT false;

-- Retención diferenciada (tarea programada en Supabase u orquestador externo):
-- - Filas con categoria = ''sistema'' y severidad ERROR: eliminar o archivar tras ~90 días (created_at).
-- - Auditoría (categoria = ''auditoria''): conservar mínimo 2 años.

CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_categoria_severidad ON logs (categoria, severidad);
CREATE INDEX IF NOT EXISTS idx_logs_entidad ON logs (entidad_tipo, entidad_id);
