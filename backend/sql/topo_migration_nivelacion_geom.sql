-- Nivelación geométrica: circuitos, V+/V-/Vi, nivel automático/electrónico, validación.

ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS tipo_contranivelacion VARCHAR(20) DEFAULT 'circuito';
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS tipo_nivel VARCHAR(20) DEFAULT 'electronico';
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS distancia_max_visual_m DOUBLE PRECISION DEFAULT 50;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS distancia_max_circuito_km DOUBLE PRECISION DEFAULT 1;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS biblioteca_at TIMESTAMPTZ;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS equipo_marca VARCHAR(100);
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS equipo_referencia VARCHAR(100);
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS equipo_serial VARCHAR(100);
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel1_estado VARCHAR(20) DEFAULT 'No Revisado';
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel1_usuario_id INT;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel1_fecha TIMESTAMPTZ;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel2_estado VARCHAR(20) DEFAULT 'No Revisado';
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel2_usuario_id INT;
ALTER TABLE topo_nivelaciones ADD COLUMN IF NOT EXISTS nivel2_fecha TIMESTAMPTZ;

UPDATE topo_nivelaciones SET tolerancia_mm_km = 1 WHERE tolerancia_mm_km IS NULL OR tolerancia_mm_km = 12;

ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS tipo_lectura VARCHAR(5);
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS ubicacion TEXT;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS punto_biblioteca_id UUID REFERENCES topo_puntos(id);
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS hilo_superior DOUBLE PRECISION;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS hilo_medio DOUBLE PRECISION;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS hilo_inferior DOUBLE PRECISION;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS lectura DOUBLE PRECISION;
ALTER TABLE topo_nivelacion_lecturas ADD COLUMN IF NOT EXISTS distancia_m DOUBLE PRECISION;

-- Migrar lecturas legacy a nuevo modelo
UPDATE topo_nivelacion_lecturas SET
  tipo_lectura = COALESCE(tipo_lectura,
    CASE
      WHEN lectura_atras IS NOT NULL THEN 'V+'
      WHEN lectura_adelante IS NOT NULL THEN 'V-'
      ELSE 'Vi'
    END),
  lectura = COALESCE(lectura, lectura_atras, lectura_adelante),
  distancia_m = COALESCE(distancia_m, distancia_atras, distancia_adelante)
WHERE tipo_lectura IS NULL;

-- Ampliar tipo_punto: estacion | auxiliar | cambio | BM
ALTER TABLE topo_nivelacion_lecturas DROP CONSTRAINT IF EXISTS topo_nivelacion_lecturas_tipo_punto_check;
ALTER TABLE topo_nivelacion_lecturas ADD CONSTRAINT topo_nivelacion_lecturas_tipo_punto_check
  CHECK (tipo_punto IN ('BM', 'TP', 'cambio', 'estacion', 'auxiliar'));

UPDATE topo_nivelacion_lecturas SET tipo_punto = 'cambio' WHERE tipo_punto = 'TP';

CREATE TABLE IF NOT EXISTS topo_nivelacion_comentarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nivelacion_id   UUID REFERENCES topo_nivelaciones(id) ON DELETE CASCADE,
    contrato_id     INTEGER NOT NULL,
    autor_id        INTEGER,
    nivel           INTEGER NOT NULL,
    estado          VARCHAR(20),
    rol_origen      VARCHAR(30),
    etiqueta        VARCHAR(50),
    mensaje         TEXT NOT NULL,
    destinatarios   JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_niv_com ON topo_nivelacion_comentarios(nivelacion_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
