-- Ejecutar DESPUÉS de competencias_contrato_y_permisos.sql
-- Permite una matriz de permisos distinta por contrato (sin chocar cargo_id + funcion_id global).

ALTER TABLE permisos DROP CONSTRAINT IF EXISTS permisos_cargo_id_funcion_id_key;

-- Una fila por (cargo, función, contrato); legacy sin contrato usa -1 en el índice
CREATE UNIQUE INDEX IF NOT EXISTS permisos_cargo_funcion_contrato_uidx
  ON permisos (cargo_id, funcion_id, COALESCE(contrato_id, -1));
