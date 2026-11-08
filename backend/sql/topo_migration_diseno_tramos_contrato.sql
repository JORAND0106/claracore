-- Configuración DG v3: estructuras a nivel de contrato, tramos con PK del mapa y sectores.
-- Los datos de prueba previos no requieren migración; este script es idempotente.

-- ── Estructuras del contrato (catálogo compartido por todos los tramos) ───────
ALTER TABLE topo_diseno_estructuras
    ADD COLUMN IF NOT EXISTS contrato_id INTEGER;

ALTER TABLE topo_diseno_estructuras
    ALTER COLUMN eje_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topo_diseno_estructuras_contrato
    ON topo_diseno_estructuras(contrato_id, created_at DESC);

-- Capas: permiten estructuras sin eje (solo estructura_id)
ALTER TABLE topo_diseno_estructura_capas
    ALTER COLUMN eje_id DROP NOT NULL;

-- Unicidad por estructura (orden / nombre) para catálogo de contrato
CREATE UNIQUE INDEX IF NOT EXISTS uq_topo_diseno_capas_estructura_orden
    ON topo_diseno_estructura_capas(estructura_id, orden)
    WHERE estructura_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_topo_diseno_capas_estructura_nombre
    ON topo_diseno_estructura_capas(estructura_id, lower(nombre))
    WHERE estructura_id IS NOT NULL;

-- ── Tramo (eje): abscisas configuradas al crear (independientes de la rasante) ─
ALTER TABLE topo_diseno_ejes
    ADD COLUMN IF NOT EXISTS abscisa_inicio DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS abscisa_fin DOUBLE PRECISION;

-- ── PKs del mapa asociados al tramo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topo_diseno_tramo_pks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id              UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    pk_id               TEXT NOT NULL,
    pk_label            TEXT,
    tramo_plataforma    TEXT,
    costado             TEXT,
    infraestructura     TEXT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    orden               INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_tramo_pks_eje
    ON topo_diseno_tramo_pks(eje_id, orden);

CREATE UNIQUE INDEX IF NOT EXISTS uq_topo_diseno_tramo_pks_eje_pk
    ON topo_diseno_tramo_pks(eje_id, pk_id);

-- ── Sectores: estructura del contrato aplicada a un rango de abscisas ────────
CREATE TABLE IF NOT EXISTS topo_diseno_tramo_sectores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eje_id              UUID NOT NULL REFERENCES topo_diseno_ejes(id) ON DELETE CASCADE,
    estructura_id       UUID NOT NULL REFERENCES topo_diseno_estructuras(id) ON DELETE RESTRICT,
    abscisa_inicio      DOUBLE PRECISION NOT NULL,
    abscisa_fin         DOUBLE PRECISION NOT NULL,
    orden               INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (abscisa_fin >= abscisa_inicio)
);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_tramo_sectores_eje
    ON topo_diseno_tramo_sectores(eje_id, orden);

CREATE INDEX IF NOT EXISTS idx_topo_diseno_tramo_sectores_estructura
    ON topo_diseno_tramo_sectores(estructura_id);
