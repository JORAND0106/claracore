-- Tolerancias Res. 643/2018: precision angular del equipo y longitud maxima entre deltas
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS precision_angular_seg DOUBLE PRECISION DEFAULT 10,
    ADD COLUMN IF NOT EXISTS longitud_max_delta_m DOUBLE PRECISION DEFAULT 300;
