-- Persistir cierre lineal preliminar (antes de compensación Bowditch)
-- para auditoría de calidad de campo tras «Terminar poligonal».
ALTER TABLE topo_poligonales
    ADD COLUMN IF NOT EXISTS error_lineal_preliminar DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS precision_relativa_preliminar DOUBLE PRECISION;

-- Recargar caché PostgREST (evita PGRST204 tras el ALTER)
NOTIFY pgrst, 'reload schema';
