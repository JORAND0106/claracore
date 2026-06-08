-- Equipo de medición y marca de ajuste (corrección Bowditch + angular)
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS equipo_marca VARCHAR(100),
    ADD COLUMN IF NOT EXISTS equipo_referencia VARCHAR(100),
    ADD COLUMN IF NOT EXISTS equipo_serial VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ajustada_at TIMESTAMPTZ;
