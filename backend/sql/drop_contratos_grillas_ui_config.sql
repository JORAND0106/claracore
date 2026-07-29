-- Limpieza opcional si se llegó a ejecutar alter_contratos_grillas_ui_config.sql.
-- La funcionalidad de columnas configurables por contrato fue revertida.
-- Idempotente.

ALTER TABLE public.contratos
  DROP COLUMN IF EXISTS grillas_ui_config;
