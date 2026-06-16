-- Interpolación longitudinal de estaciones (PK) al importar diseño geométrico
ALTER TABLE topo_diseno_ejes
    ADD COLUMN IF NOT EXISTS interpolar_abscisas BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS paso_abscisas_m DOUBLE PRECISION;
