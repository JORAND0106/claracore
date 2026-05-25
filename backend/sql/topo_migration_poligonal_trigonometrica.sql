-- Poligonal trigonométrica: cotas, ángulo vertical e instrumento
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS metodo VARCHAR(20) DEFAULT 'trigonometrica',
    ADD COLUMN IF NOT EXISTS tolerancia_cota_mm_km DOUBLE PRECISION DEFAULT 12,
    ADD COLUMN IF NOT EXISTS error_cierre_dz DOUBLE PRECISION;

ALTER TABLE topo_poligonal_estaciones
    ADD COLUMN IF NOT EXISTS altura_instrumento DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS angulo_vertical DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS altura_objetivo DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lectura_mira DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS delta_cota DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS correccion_cota DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS cota_ajustada DOUBLE PRECISION;
