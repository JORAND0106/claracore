-- Fase 2 — Dependencias globales del contrato (revisar antes de ejecutar en Supabase)
-- Aplica la misma secuencia capítulo→capítulo a todos los PKs que tengan ambos capítulos programados.
-- Una dependencia específica (prog_dependencias) con el mismo par de capítulos en el mismo PK
-- tiene prioridad sobre la global al calcular CPM.

CREATE TABLE IF NOT EXISTS prog_dependencias_globales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      UUID NOT NULL REFERENCES prog_versiones(id) ON DELETE CASCADE,
  contrato_id     BIGINT NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  capitulo_origen   VARCHAR(100) NOT NULL,
  capitulo_destino  VARCHAR(100) NOT NULL,
  tipo            VARCHAR(5) NOT NULL CHECK (tipo IN ('FS', 'SS', 'FF', 'SF')),
  lag_dias        INT NOT NULL DEFAULT 0,
  creado_por      BIGINT REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prog_dependencias_globales_no_auto
    CHECK (capitulo_origen <> capitulo_destino),
  CONSTRAINT prog_dependencias_globales_unique
    UNIQUE (version_id, capitulo_origen, capitulo_destino, tipo)
);

CREATE INDEX IF NOT EXISTS idx_prog_dep_glob_version
  ON prog_dependencias_globales (version_id);

CREATE INDEX IF NOT EXISTS idx_prog_dep_glob_contrato
  ON prog_dependencias_globales (contrato_id);

COMMENT ON TABLE prog_dependencias_globales IS
  'Secuencia estándar capítulo→capítulo por versión; se expande a cada PK con ambos capítulos programados.';

-- RLS (mismo patrón que prog_dependencias)
ALTER TABLE prog_dependencias_globales ENABLE ROW LEVEL SECURITY;

CREATE POLICY prog_dep_glob_select ON prog_dependencias_globales
  FOR SELECT USING (true);

CREATE POLICY prog_dep_glob_insert ON prog_dependencias_globales
  FOR INSERT WITH CHECK (true);

CREATE POLICY prog_dep_glob_update ON prog_dependencias_globales
  FOR UPDATE USING (true);

CREATE POLICY prog_dep_glob_delete ON prog_dependencias_globales
  FOR DELETE USING (true);
