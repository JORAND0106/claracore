-- Dependencia de análisis entre capas (espesor vs capa de referencia inferior)

ALTER TABLE topo_diseno_estructura_capas
    ADD COLUMN IF NOT EXISTS referencia_analisis_orden INTEGER;

COMMENT ON COLUMN topo_diseno_estructura_capas.referencia_analisis_orden IS
    'Orden (1-based) de la capa inferior usada para verificar espesor. NULL = capa siguiente hacia abajo.';
