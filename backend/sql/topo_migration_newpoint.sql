-- NewPoint: resección desde puesto desconocido hacia 2 puntos de una poligonal sellada.
-- Reemplaza el flujo legacy de topo_intersecciones.

CREATE TABLE IF NOT EXISTS topo_newpoints (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id            INTEGER NOT NULL,
    poligonal_id           UUID NOT NULL REFERENCES topo_poligonales(id) ON DELETE CASCADE,
    nombre_punto_nuevo     VARCHAR(50) NOT NULL,
    descripcion            TEXT,
    punto1_id              UUID REFERENCES topo_puntos(id),
    distancia1             DOUBLE PRECISION,
    angulo_observado_gms   DOUBLE PRECISION,
    punto2_id              UUID REFERENCES topo_puntos(id),
    distancia2             DOUBLE PRECISION,
    norte_resultado        DOUBLE PRECISION,
    este_resultado         DOUBLE PRECISION,
    opcion_a_norte         DOUBLE PRECISION,
    opcion_a_este          DOUBLE PRECISION,
    opcion_b_norte         DOUBLE PRECISION,
    opcion_b_este          DOUBLE PRECISION,
    opcion_elegida         VARCHAR(1),
    cota_resultado         DOUBLE PRECISION,
    error_lineal           DOUBLE PRECISION,
    error_angular_segundos DOUBLE PRECISION,
    tolerancia_lineal      DOUBLE PRECISION DEFAULT 0.05,
    tolerancia_angular_seg DOUBLE PRECISION DEFAULT 30,
    admisible              BOOLEAN,
    tipo_punto             VARCHAR(20) DEFAULT 'auxiliar',
    estado                 VARCHAR(20) DEFAULT 'calculado',
    nivel1_estado          VARCHAR(20) DEFAULT 'No Revisado',
    nivel1_usuario_id      INT,
    nivel1_fecha           TIMESTAMPTZ,
    nivel2_estado          VARCHAR(20) DEFAULT 'No Revisado',
    nivel2_usuario_id      INT,
    nivel2_fecha           TIMESTAMPTZ,
    biblioteca_at          TIMESTAMPTZ,
    operador               VARCHAR(100),
    fecha                  DATE,
    equipo_marca           VARCHAR(100),
    equipo_referencia      VARCHAR(100),
    equipo_serial          VARCHAR(100),
    creado_por             UUID,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topo_newpoint_comentarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newpoint_id UUID NOT NULL REFERENCES topo_newpoints(id) ON DELETE CASCADE,
    contrato_id INT NOT NULL,
    autor_id INT,
    nivel INT NOT NULL CHECK (nivel IN (1, 2)),
    estado VARCHAR(20) NOT NULL,
    rol_origen VARCHAR(30),
    etiqueta VARCHAR(120),
    mensaje TEXT NOT NULL,
    destinatarios JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topo_newpoints_contrato ON topo_newpoints(contrato_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topo_newpoints_poligonal ON topo_newpoints(poligonal_id);
CREATE INDEX IF NOT EXISTS idx_topo_np_com ON topo_newpoint_comentarios(newpoint_id, created_at DESC);
