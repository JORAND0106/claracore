-- Operador y fecha de campo en biblioteca de puntos (origen del circuito)
ALTER TABLE topo_puntos
    ADD COLUMN IF NOT EXISTS operador VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fecha_campo DATE;
