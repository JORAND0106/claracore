-- Circuito nivelación: abscisa y descripción de punto (reemplaza ubicacion en UI).
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS abscisa TEXT;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS descripcion_punto TEXT;

UPDATE topo_nivelacion_lecturas
SET descripcion_punto = ubicacion
WHERE descripcion_punto IS NULL AND ubicacion IS NOT NULL AND trim(ubicacion) <> '';

ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS distancia_vplus_km DOUBLE PRECISION;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS distancia_vminus_km DOUBLE PRECISION;
