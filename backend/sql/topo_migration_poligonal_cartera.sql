-- Cartera de poligonal: azimut propagado, angulo corregido y resumen de cierre angular
ALTER TABLE topo_poligonal_estaciones
    ADD COLUMN IF NOT EXISTS azimut DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS angulo_corregido DOUBLE PRECISION;

ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS suma_angular_obs DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS suma_angular_teorica DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS error_angular_seg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS num_vertices INTEGER;
