-- Políticas de confidencialidad y tratamiento de datos (Habeas Data / normativa aplicable)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS politicas_aceptadas boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS politicas_fecha timestamp with time zone,
  ADD COLUMN IF NOT EXISTS politicas_version character varying DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS politicas_ip character varying;

COMMENT ON COLUMN usuarios.politicas_aceptadas IS 'Usuario aceptó la versión vigente de políticas de confidencialidad';
COMMENT ON COLUMN usuarios.politicas_fecha IS 'Momento UTC de la aceptación';
COMMENT ON COLUMN usuarios.politicas_version IS 'Versión del texto aceptado (ej. 1.0)';
COMMENT ON COLUMN usuarios.politicas_ip IS 'IP registrada al aceptar (auditoría)';
