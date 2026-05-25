-- ============================================================
-- MODULO TOPOGRAFIA - TABLAS INDEPENDIENTES
-- ClaraCore - No afecta ningún módulo existente
-- ============================================================

-- Biblioteca de puntos verificados por contrato
CREATE TABLE IF NOT EXISTS topo_puntos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     INTEGER NOT NULL,
    nombre          VARCHAR(50) NOT NULL,
    norte           DOUBLE PRECISION,
    este            DOUBLE PRECISION,
    cota            DOUBLE PRECISION,
    tipo            VARCHAR(20) CHECK (tipo IN ('BM','estacion','auxiliar','PI','cambio')),
    verificado      BOOLEAN DEFAULT FALSE,
    modulo_origen   VARCHAR(30),
    circuito_id     UUID,
    fecha_verificacion TIMESTAMPTZ,
    creado_por      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contrato_id, nombre)
);

-- Circuitos de poligonal
CREATE TABLE IF NOT EXISTS topo_poligonales (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id          INTEGER NOT NULL,
    nombre               VARCHAR(100) NOT NULL,
    tipo                 VARCHAR(10) CHECK (tipo IN ('abierta','cerrada')),
    sentido              VARCHAR(15),
    punto_inicial_id     UUID REFERENCES topo_puntos(id),
    punto_final_id       UUID REFERENCES topo_puntos(id),
    tolerancia_relativa  INTEGER DEFAULT 3000,
    error_cierre_dn      DOUBLE PRECISION,
    error_cierre_de      DOUBLE PRECISION,
    error_lineal         DOUBLE PRECISION,
    precision_relativa   DOUBLE PRECISION,
    estado               VARCHAR(20) DEFAULT 'borrador',
    nivel_validacion     INTEGER DEFAULT 0,
    observaciones        TEXT,
    operador             VARCHAR(100),
    equipo               VARCHAR(100),
    fecha_campo          DATE,
    creado_por           UUID,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Estaciones de la poligonal
CREATE TABLE IF NOT EXISTS topo_poligonal_estaciones (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poligonal_id      UUID REFERENCES topo_poligonales(id) ON DELETE CASCADE,
    orden             INTEGER NOT NULL,
    nombre_punto      VARCHAR(50),
    angulo_medido     DOUBLE PRECISION,
    distancia         DOUBLE PRECISION,
    delta_norte       DOUBLE PRECISION,
    delta_este        DOUBLE PRECISION,
    correccion_norte  DOUBLE PRECISION,
    correccion_este   DOUBLE PRECISION,
    norte_ajustado    DOUBLE PRECISION,
    este_ajustado     DOUBLE PRECISION
);

-- Puntos auxiliares de poligonal (radiacion)
CREATE TABLE IF NOT EXISTS topo_poligonal_auxiliares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poligonal_id  UUID REFERENCES topo_poligonales(id) ON DELETE CASCADE,
    estacion_id   UUID REFERENCES topo_poligonal_estaciones(id),
    nombre_punto  VARCHAR(50),
    angulo        DOUBLE PRECISION,
    distancia     DOUBLE PRECISION,
    norte         DOUBLE PRECISION,
    este          DOUBLE PRECISION
);

-- Circuitos de nivelacion
CREATE TABLE IF NOT EXISTS topo_nivelaciones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id           INTEGER NOT NULL,
    nombre                VARCHAR(100) NOT NULL,
    tipo                  VARCHAR(10) CHECK (tipo IN ('abierta','cerrada')),
    bm_inicial_id         UUID REFERENCES topo_puntos(id),
    bm_final_id           UUID REFERENCES topo_puntos(id),
    tolerancia_mm_km      DOUBLE PRECISION DEFAULT 12,
    distancia_total_km    DOUBLE PRECISION,
    error_cierre          DOUBLE PRECISION,
    tolerancia_calculada  DOUBLE PRECISION,
    estado                VARCHAR(20) DEFAULT 'borrador',
    nivel_validacion      INTEGER DEFAULT 0,
    observaciones         TEXT,
    operador              VARCHAR(100),
    equipo                VARCHAR(100),
    fecha_campo           DATE,
    creado_por            UUID,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas de nivelacion
CREATE TABLE IF NOT EXISTS topo_nivelacion_lecturas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nivelacion_id       UUID REFERENCES topo_nivelaciones(id) ON DELETE CASCADE,
    orden               INTEGER NOT NULL,
    nombre_punto        VARCHAR(50),
    tipo_punto          VARCHAR(10) CHECK (tipo_punto IN ('BM','TP','cambio')),
    lectura_atras       DOUBLE PRECISION,
    lectura_adelante    DOUBLE PRECISION,
    distancia_atras     DOUBLE PRECISION,
    distancia_adelante  DOUBLE PRECISION,
    altura_instrumento  DOUBLE PRECISION,
    cota_calculada      DOUBLE PRECISION,
    cota_ajustada       DOUBLE PRECISION,
    correccion          DOUBLE PRECISION
);

-- Proyectos de verificacion de vias (diseño geometrico)
CREATE TABLE IF NOT EXISTS topo_vias_proyectos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     INTEGER NOT NULL,
    nombre          VARCHAR(100),
    abscisa_inicio  DOUBLE PRECISION,
    abscisa_fin     DOUBLE PRECISION,
    ancho_calzada   DOUBLE PRECISION,
    capas           JSONB,
    cota_subrasante JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Registros de campo verificacion vias
CREATE TABLE IF NOT EXISTS topo_vias_registros (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id       UUID REFERENCES topo_vias_proyectos(id),
    contrato_id       INTEGER NOT NULL,
    capa_recibir      VARCHAR(50),
    calzada           VARCHAR(20),
    bm_referencia_id  UUID REFERENCES topo_puntos(id),
    fecha_campo       DATE,
    operador          VARCHAR(100),
    estado            VARCHAR(20) DEFAULT 'borrador',
    nivel_validacion  INTEGER DEFAULT 0,
    area_intervencion JSONB,
    area_m2           DOUBLE PRECISION,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas de campo por abscisa
CREATE TABLE IF NOT EXISTS topo_vias_lecturas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id         UUID REFERENCES topo_vias_registros(id) ON DELETE CASCADE,
    orden               INTEGER,
    abscisa             DOUBLE PRECISION,
    punto_tomado        VARCHAR(20),
    altura_instrumento  DOUBLE PRECISION,
    lectura_mira        DOUBLE PRECISION,
    cota_campo          DOUBLE PRECISION,
    cota_diseno         DOUBLE PRECISION,
    delta               DOUBLE PRECISION,
    dentro_tolerancia   BOOLEAN
);

-- Tramos de tuberia
CREATE TABLE IF NOT EXISTS topo_tuberias (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id          INTEGER NOT NULL,
    nombre               VARCHAR(100),
    diametro_nominal     VARCHAR(20),
    material             VARCHAR(50),
    cota_diseno_inicio   DOUBLE PRECISION,
    cota_diseno_fin      DOUBLE PRECISION,
    longitud_total       DOUBLE PRECISION,
    pendiente_diseno     DOUBLE PRECISION,
    factor_atraque       DOUBLE PRECISION,
    ancho_excavacion     DOUBLE PRECISION,
    numero_tubos         INTEGER,
    tolerancia_cm        DOUBLE PRECISION DEFAULT 2.0,
    estado               VARCHAR(20) DEFAULT 'en_proceso',
    nivel_validacion     INTEGER DEFAULT 0,
    fecha_inicio         DATE,
    fecha_cierre         DATE,
    creado_por           UUID,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Registros diarios de instalacion de tuberia
CREATE TABLE IF NOT EXISTS topo_tuberia_registros (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tuberia_id        UUID REFERENCES topo_tuberias(id) ON DELETE CASCADE,
    fecha             DATE,
    bm_referencia_id  UUID REFERENCES topo_puntos(id),
    altura_instrumento DOUBLE PRECISION,
    operador          VARCHAR(100),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Tubos instalados por dia
CREATE TABLE IF NOT EXISTS topo_tuberia_tubos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id           UUID REFERENCES topo_tuberia_registros(id) ON DELETE CASCADE,
    numero_tubo           INTEGER,
    abscisa_inicio        DOUBLE PRECISION,
    abscisa_fin           DOUBLE PRECISION,
    cota_diseno_inicio    DOUBLE PRECISION,
    cota_diseno_fin       DOUBLE PRECISION,
    lectura_mira_inicio   DOUBLE PRECISION,
    lectura_mira_fin      DOUBLE PRECISION,
    cota_campo_inicio     DOUBLE PRECISION,
    cota_campo_fin        DOUBLE PRECISION,
    delta_inicio          DOUBLE PRECISION,
    delta_fin             DOUBLE PRECISION,
    dentro_tolerancia     BOOLEAN
);

-- Calculos de areas por coordenadas
CREATE TABLE IF NOT EXISTS topo_areas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id  INTEGER NOT NULL,
    nombre       VARCHAR(100),
    descripcion  TEXT,
    puntos       JSONB NOT NULL,
    area_m2      DOUBLE PRECISION,
    area_ha      DOUBLE PRECISION,
    perimetro    DOUBLE PRECISION,
    estado       VARCHAR(20) DEFAULT 'calculado',
    operador     VARCHAR(100),
    fecha        DATE,
    creado_por   UUID,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Interseccion de coordenadas (reseccion)
CREATE TABLE IF NOT EXISTS topo_intersecciones (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id            INTEGER NOT NULL,
    nombre_punto_nuevo     VARCHAR(50),
    descripcion            TEXT,
    punto1_id              UUID REFERENCES topo_puntos(id),
    azimut1_gms            DOUBLE PRECISION,
    distancia1             DOUBLE PRECISION,
    punto2_id              UUID REFERENCES topo_puntos(id),
    azimut2_gms            DOUBLE PRECISION,
    distancia2             DOUBLE PRECISION,
    norte_resultado        DOUBLE PRECISION,
    este_resultado         DOUBLE PRECISION,
    error_lineal           DOUBLE PRECISION,
    error_angular_segundos DOUBLE PRECISION,
    tolerancia_lineal      DOUBLE PRECISION DEFAULT 0.05,
    tolerancia_angular_seg DOUBLE PRECISION DEFAULT 30,
    admisible              BOOLEAN,
    estado                 VARCHAR(20) DEFAULT 'calculado',
    operador               VARCHAR(100),
    fecha                  DATE,
    creado_por             UUID,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Equipos de topografia registrados
CREATE TABLE IF NOT EXISTS topo_equipos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id   INTEGER NOT NULL,
    nombre        VARCHAR(100),
    tipo          VARCHAR(20) CHECK (tipo IN ('nivel','estacion_total','gps','otro')),
    marca         VARCHAR(50),
    modelo        VARCHAR(50),
    serie         VARCHAR(50),
    propietario   VARCHAR(100),
    activo        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Verificaciones periodicas de equipos
CREATE TABLE IF NOT EXISTS topo_equipos_verificaciones (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id         UUID REFERENCES topo_equipos(id),
    contrato_id       INTEGER NOT NULL,
    fecha             DATE NOT NULL,
    tipo_verificacion VARCHAR(30) CHECK (tipo_verificacion IN ('nivel','estacion_total')),
    operador          VARCHAR(100),
    condiciones       VARCHAR(100),
    resultados        JSONB NOT NULL,
    cumple            BOOLEAN,
    observaciones     TEXT,
    proxima_verificacion DATE,
    nivel_validacion  INTEGER DEFAULT 0,
    creado_por        UUID,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Firmas digitales (compartida entre todos los modulos de topografia)
CREATE TABLE IF NOT EXISTS topo_firmas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modulo          VARCHAR(30),
    referencia_id   UUID,
    tipo_firmante   VARCHAR(30),
    nombre_firmante VARCHAR(100),
    cargo_firmante  VARCHAR(100),
    matricula       VARCHAR(50),
    firma_base64    TEXT,
    fecha_firma     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topo_puntos_contrato ON topo_puntos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_topo_poligonales_contrato ON topo_poligonales(contrato_id);
CREATE INDEX IF NOT EXISTS idx_topo_nivelaciones_contrato ON topo_nivelaciones(contrato_id);
CREATE INDEX IF NOT EXISTS idx_topo_equipos_contrato ON topo_equipos(contrato_id);
