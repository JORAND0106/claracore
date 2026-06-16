-- NewPoint: dos soluciones A/B; el usuario elige cuál validar.

ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS opcion_a_norte DOUBLE PRECISION;
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS opcion_a_este DOUBLE PRECISION;
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS opcion_b_norte DOUBLE PRECISION;
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS opcion_b_este DOUBLE PRECISION;
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS opcion_elegida VARCHAR(1);
