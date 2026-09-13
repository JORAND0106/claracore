-- Persistir cierre lineal preliminar (antes de compensación Bowditch)
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS error_lineal_preliminar DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS precision_relativa_preliminar DOUBLE PRECISION;
