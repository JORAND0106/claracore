-- NewPoint: datos de campo — profesional y equipo.

ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS equipo_marca VARCHAR(100);
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS equipo_referencia VARCHAR(100);
ALTER TABLE topo_newpoints ADD COLUMN IF NOT EXISTS equipo_serial VARCHAR(100);
