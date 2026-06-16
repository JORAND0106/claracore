-- Estructuras de vía versionadas + config transversal + puntos de perfil

CREATE TABLE IF NOT EXISTS topo_diseno_estructuras (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id          UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    nombre          VARCHAR(120) NOT NULL,
    vigente         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_estructuras_eje
    ON topo_diseno_estructuras(eje_id, created_at DESC);

ALTER TABLE topo_diseno_estructura_capas
    ADD COLUMN IF NOT EXISTS estructura_id UUID REFERENCES topo_diseno_estructuras(id) ON DELETE CASCADE;

ALTER TABLE topo_diseno_ejes
    ADD COLUMN IF NOT EXISTS tipo_seccion VARCHAR(1) DEFAULT 'A',
    ADD COLUMN IF NOT EXISTS ancho_via_m DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS calcular_intermedias BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS paso_intermedias_m DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS topo_diseno_perfil_puntos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id          UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    tramo           VARCHAR(100),
    abscisa         DOUBLE PRECISION NOT NULL,
    ordenada        DOUBLE PRECISION NOT NULL,
    cota            DOUBLE PRECISION NOT NULL,
    es_referencia   BOOLEAN DEFAULT FALSE,
    UNIQUE(eje_id, tramo, abscisa, ordenada)
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_perfil_eje
    ON topo_diseno_perfil_puntos(eje_id, abscisa, ordenada);

-- Migrar capas existentes (eje_id) a estructura inicial vigente
INSERT INTO topo_diseno_estructuras (eje_id, nombre, vigente)
SELECT DISTINCT c.eje_id, 'Estructura inicial', TRUE
FROM topo_diseno_estructura_capas c
WHERE c.eje_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM topo_diseno_estructuras e WHERE e.eje_id = c.eje_id
  );

UPDATE topo_diseno_estructura_capas c
SET estructura_id = e.id
FROM topo_diseno_estructuras e
WHERE c.eje_id = e.eje_id
  AND c.estructura_id IS NULL
  AND e.vigente = TRUE;
