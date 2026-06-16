-- Sobre-ancho transversal adicional por capa (m)

ALTER TABLE topo_diseno_estructura_capas
    ADD COLUMN IF NOT EXISTS sobre_ancho_m DOUBLE PRECISION DEFAULT 0;

COMMENT ON COLUMN topo_diseno_estructura_capas.sobre_ancho_m IS
    'Metros adicionales al ancho de vía del eje para el perfil transversal de esta capa en entrega DG.';
