-- Poligonal: punto de visado (referencia para el azimut de partida)
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS punto_visado_id UUID REFERENCES topo_puntos(id);
