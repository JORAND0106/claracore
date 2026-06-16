-- Entrega DG Obra: seguimiento en campo por eje + capa (diseño geométrico)

CREATE TABLE IF NOT EXISTS topo_entrega_dg (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         INTEGER NOT NULL,
    eje_id              UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    nombre              VARCHAR(120) NOT NULL,
    indice_capa         INTEGER NOT NULL DEFAULT 0,
    capa_nombre         VARCHAR(80),
    bm_referencia_id    UUID REFERENCES topo_puntos(id),
    fecha_campo         DATE,
    operador            VARCHAR(100),
    tolerancia_m        DOUBLE PRECISION DEFAULT 0.010,
    estado              VARCHAR(20) DEFAULT 'activa',
    nivel_validacion    INTEGER DEFAULT 0,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_entrega_dg_contrato
    ON topo_entrega_dg(contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topo_entrega_dg_eje
    ON topo_entrega_dg(eje_id);

CREATE TABLE IF NOT EXISTS topo_entrega_dg_lecturas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id          UUID NOT NULL REFERENCES topo_entrega_dg(id) ON DELETE CASCADE,
    orden               INTEGER,
    tramo               VARCHAR(100),
    abscisa             DOUBLE PRECISION NOT NULL,
    ordenada            DOUBLE PRECISION NOT NULL,
    altura_instrumento  DOUBLE PRECISION,
    lectura_mira        DOUBLE PRECISION,
    cota_campo          DOUBLE PRECISION,
    cota_diseno         DOUBLE PRECISION,
    cota_rasante        DOUBLE PRECISION,
    espesor_diseno_m    DOUBLE PRECISION,
    espesor_real_m      DOUBLE PRECISION,
    delta               DOUBLE PRECISION,
    dentro_tolerancia   BOOLEAN,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_entrega_dg_lect_entrega
    ON topo_entrega_dg_lecturas(entrega_id, abscisa, ordenada);
