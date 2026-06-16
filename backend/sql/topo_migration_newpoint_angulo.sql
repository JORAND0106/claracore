-- NewPoint: reemplaza azimuts por angulo observado (puesto arbitrario, referencia 00.0000 hacia P1).
-- Ejecutar solo si ya corrio topo_migration_newpoint.sql con columnas azimut1_gms / azimut2_gms.

ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS angulo_observado_gms DOUBLE PRECISION;

UPDATE topo_newpoints
SET angulo_observado_gms = COALESCE(angulo_observado_gms, azimut2_gms - azimut1_gms)
WHERE angulo_observado_gms IS NULL
  AND azimut1_gms IS NOT NULL
  AND azimut2_gms IS NOT NULL;

ALTER TABLE topo_newpoints DROP COLUMN IF EXISTS azimut1_gms;
ALTER TABLE topo_newpoints DROP COLUMN IF EXISTS azimut2_gms;
