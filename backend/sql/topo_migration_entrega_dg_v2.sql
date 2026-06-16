-- Entrega DG v2: rango de abscisas + bloques de instrumento

ALTER TABLE topo_entrega_dg
    ADD COLUMN IF NOT EXISTS abscisa_desde DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS abscisa_hasta DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS topo_entrega_dg_bloques (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id          UUID NOT NULL REFERENCES topo_entrega_dg(id) ON DELETE CASCADE,
    orden               INTEGER NOT NULL DEFAULT 1,
    abscisa_inicio      DOUBLE PRECISION,
    punto_biblioteca_id UUID REFERENCES topo_puntos(id),
    nombre_punto        VARCHAR(80),
    v_mas               DOUBLE PRECISION,
    altura_instrumento  DOUBLE PRECISION,
    cota_punto          DOUBLE PRECISION,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_entrega_dg_bloques_entrega
    ON topo_entrega_dg_bloques(entrega_id, orden);

ALTER TABLE topo_entrega_dg_lecturas
    ADD COLUMN IF NOT EXISTS bloque_id UUID REFERENCES topo_entrega_dg_bloques(id) ON DELETE CASCADE;

-- Si la tabla ya existía sin abscisa_inicio / punto_biblioteca_id:
ALTER TABLE topo_entrega_dg_bloques
    ADD COLUMN IF NOT EXISTS abscisa_inicio DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS punto_biblioteca_id UUID REFERENCES topo_puntos(id);
