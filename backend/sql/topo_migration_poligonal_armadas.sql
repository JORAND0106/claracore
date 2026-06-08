-- Poligonal por armadas (ceros atras): cada armada tiene estacion, visado y HI
CREATE TABLE IF NOT EXISTS topo_poligonal_armadas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poligonal_id       UUID REFERENCES topo_poligonales(id) ON DELETE CASCADE,
    orden              INTEGER NOT NULL,
    estacion_nombre    VARCHAR(50),
    visado_nombre      VARCHAR(50),
    altura_instrumento DOUBLE PRECISION,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE topo_poligonal_estaciones
    ADD COLUMN IF NOT EXISTS armada_id  UUID REFERENCES topo_poligonal_armadas(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS tipo_punto VARCHAR(20) DEFAULT 'auxiliar',
    ADD COLUMN IF NOT EXISTS norte      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS este       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS cota       DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_topo_armadas_poligonal ON topo_poligonal_armadas(poligonal_id);

-- Backfill: crear armada 1 para poligonales existentes y asignar sus estaciones
DO $$
DECLARE
    r       RECORD;
    v_arm   UUID;
    v_est   TEXT;
    v_vis   TEXT;
    v_hi    DOUBLE PRECISION;
BEGIN
    FOR r IN SELECT id, punto_inicial_id, punto_visado_id FROM topo_poligonales LOOP
        IF EXISTS (SELECT 1 FROM topo_poligonal_armadas WHERE poligonal_id = r.id) THEN
            CONTINUE;
        END IF;
        SELECT nombre INTO v_est FROM topo_puntos WHERE id = r.punto_inicial_id;
        SELECT nombre INTO v_vis FROM topo_puntos WHERE id = r.punto_visado_id;
        SELECT altura_instrumento INTO v_hi
          FROM topo_poligonal_estaciones
          WHERE poligonal_id = r.id ORDER BY orden LIMIT 1;
        INSERT INTO topo_poligonal_armadas (poligonal_id, orden, estacion_nombre, visado_nombre, altura_instrumento)
        VALUES (r.id, 1, v_est, v_vis, v_hi)
        RETURNING id INTO v_arm;
        UPDATE topo_poligonal_estaciones
          SET armada_id = v_arm
          WHERE poligonal_id = r.id AND armada_id IS NULL;
    END LOOP;
END $$;
