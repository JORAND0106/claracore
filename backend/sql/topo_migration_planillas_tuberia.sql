-- Planillas de Tubería (ALCANTARILLA / FILTRO)
-- Campo separado de cálculos; consolidado al cerrar; versionado optimista.

CREATE TABLE IF NOT EXISTS topo_planillas_tuberia (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id            INTEGER NOT NULL,
    tipo                   VARCHAR(20) NOT NULL CHECK (tipo IN ('ALCANTARILLA', 'FILTRO')),
    nombre                 VARCHAR(200),
    pk_id                  VARCHAR(80),
    costado                VARCHAR(40),
    abscisa_inicial_txt    VARCHAR(40),
    abscisa_final_txt      VARCHAR(40),
    diametro_m             DOUBLE PRECISION,
    espesor_m              DOUBLE PRECISION DEFAULT 0,
    ancho_excavacion_m     DOUBLE PRECISION,
    relacion_atraque       VARCHAR(10) DEFAULT '1:3',
    material               VARCHAR(80),
    norte_ref              DOUBLE PRECISION,
    este_ref               DOUBLE PRECISION,
    altura_relleno_m       DOUBLE PRECISION,
    area_1_m2              DOUBLE PRECISION,
    area_2_m2              DOUBLE PRECISION,
    estado                 VARCHAR(20) NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador', 'cerrado', 'validado')),
    version                INTEGER NOT NULL DEFAULT 1,
    nivel_validacion       INTEGER NOT NULL DEFAULT 0,
    cerrado_at             TIMESTAMPTZ,
    -- usuarios.id en ClaraCore es INTEGER (no UUID)
    cerrado_por            INTEGER,
    validado_at            TIMESTAMPTZ,
    validado_por           INTEGER,
    reabierto_at           TIMESTAMPTZ,
    reabierto_por          INTEGER,
    validacion_revocada_at TIMESTAMPTZ,
    validacion_revocada_por INTEGER,
    calculo_snapshot       JSONB,
    meta_cabecera          JSONB DEFAULT '{}'::jsonb,
    firmas                 JSONB DEFAULT '{}'::jsonb,
    creado_por             INTEGER,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_pt_contrato ON topo_planillas_tuberia (contrato_id, created_at DESC);

CREATE TABLE IF NOT EXISTS topo_planilla_tuberia_filas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id             UUID NOT NULL REFERENCES topo_planillas_tuberia(id) ON DELETE CASCADE,
    orden                   INTEGER NOT NULL,
    abscisa                 DOUBLE PRECISION,
    terreno_natural         DOUBLE PRECISION,
    subrasante_via          DOUBLE PRECISION,
    terminado_filtro        DOUBLE PRECISION,
    -- Cota Lomo (solo ALCANTARILLA). También se puede persistir en terminado_filtro
    -- como fallback si esta columna aún no existe en el entorno.
    cota_lomo               DOUBLE PRECISION,
    cota_fondo_excavacion   DOUBLE PRECISION,
    norte                   DOUBLE PRECISION,
    este                    DOUBLE PRECISION,
    observacion             TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (planilla_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_topo_pt_filas ON topo_planilla_tuberia_filas (planilla_id, orden);

CREATE TABLE IF NOT EXISTS topo_planilla_tuberia_descuentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id     UUID NOT NULL REFERENCES topo_planillas_tuberia(id) ON DELETE CASCADE,
    codigo          VARCHAR(40) NOT NULL,
    cantidad        DOUBLE PRECISION NOT NULL DEFAULT 0,
    nota            TEXT,
    UNIQUE (planilla_id, codigo)
);

CREATE TABLE IF NOT EXISTS topo_planilla_tuberia_consolidado (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id             INTEGER NOT NULL,
    planilla_id             UUID NOT NULL UNIQUE REFERENCES topo_planillas_tuberia(id) ON DELETE CASCADE,
    c01_planilla_id         UUID,
    c02_tipo                VARCHAR(20),
    c03_pk_id               VARCHAR(80),
    c04_nombre              VARCHAR(200),
    c05_costado             VARCHAR(40),
    c06_abscisa_inicial     DOUBLE PRECISION,
    c07_abscisa_final       DOUBLE PRECISION,
    c08_longitud_m          DOUBLE PRECISION,
    c09_diametro_m          DOUBLE PRECISION,
    c10_espesor_m           DOUBLE PRECISION,
    c11_relacion_atraque    VARCHAR(10),
    c12_ancho_excavacion_m  DOUBLE PRECISION,
    c13_vol_excavacion_m3   DOUBLE PRECISION,
    c14_vol_triturado_m3    DOUBLE PRECISION,
    c15_vol_relleno_m3      DOUBLE PRECISION,
    c16_area_geotextil_m2   DOUBLE PRECISION,
    c17_long_tuberia_m      DOUBLE PRECISION,
    c18_norte_ref           DOUBLE PRECISION,
    c19_este_ref            DOUBLE PRECISION,
    c20_estado              VARCHAR(20),
    c21_cerrado_at          TIMESTAMPTZ,
    c22_contrato_id         INTEGER,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_pt_consol ON topo_planilla_tuberia_consolidado (contrato_id);

CREATE TABLE IF NOT EXISTS topo_planilla_tuberia_auditoria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id     UUID NOT NULL REFERENCES topo_planillas_tuberia(id) ON DELETE CASCADE,
    contrato_id     INTEGER NOT NULL,
    accion          VARCHAR(40) NOT NULL,
    usuario_id      INTEGER,
    detalle         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Si la tabla ya existía con columnas UUID (error 22P02 al insertar usuario_id=3),
-- convertirlas a INTEGER. Seguro re-ejecutar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'topo_planillas_tuberia'
      AND column_name = 'creado_por' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE topo_planillas_tuberia
      ALTER COLUMN creado_por TYPE INTEGER USING NULL,
      ALTER COLUMN cerrado_por TYPE INTEGER USING NULL,
      ALTER COLUMN validado_por TYPE INTEGER USING NULL,
      ALTER COLUMN reabierto_por TYPE INTEGER USING NULL,
      ALTER COLUMN validacion_revocada_por TYPE INTEGER USING NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'topo_planilla_tuberia_auditoria'
      AND column_name = 'usuario_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE topo_planilla_tuberia_auditoria
      ALTER COLUMN usuario_id TYPE INTEGER USING NULL;
  END IF;
END $$;
