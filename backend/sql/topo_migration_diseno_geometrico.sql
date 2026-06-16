-- Diseño geométrico de vía: ejes, rasante (CSV) y estructura de capas

CREATE TABLE IF NOT EXISTS topo_diseno_ejes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     INTEGER NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_ejes_contrato
    ON topo_diseno_ejes(contrato_id, created_at DESC);

-- Perfil de rasante / capa terminada importado (TRAMO | ABSCISA | IZQ | EJE | DER | ANCHO)
CREATE TABLE IF NOT EXISTS topo_diseno_rasante (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id          UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    tramo           VARCHAR(100),
    abscisa         DOUBLE PRECISION NOT NULL,
    cota_izquierda  DOUBLE PRECISION,
    cota_eje        DOUBLE PRECISION,
    cota_derecha    DOUBLE PRECISION,
    ancho           DOUBLE PRECISION,
    UNIQUE(eje_id, tramo, abscisa)
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_rasante_eje
    ON topo_diseno_rasante(eje_id, abscisa);

-- Estructura de vía: capas de arriba hacia abajo (capa 1 = terminado / rasante del CSV)
CREATE TABLE IF NOT EXISTS topo_diseno_estructura_capas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id          UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    orden           INTEGER NOT NULL,
    nombre          VARCHAR(80) NOT NULL,
    espesor_m       DOUBLE PRECISION NOT NULL CHECK (espesor_m > 0),
    UNIQUE(eje_id, orden),
    UNIQUE(eje_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_capas_eje
    ON topo_diseno_estructura_capas(eje_id, orden);
