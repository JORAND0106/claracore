-- Alcance por contrato + registro de lectura por usuario (módulo Inicio).
-- Ejecutar en Supabase después de inicio_novedades.sql

ALTER TABLE inicio_novedades
  ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inicio_novedades_contrato_id ON inicio_novedades (contrato_id);

COMMENT ON COLUMN inicio_novedades.contrato_id IS
  'NULL = novedad global (visible en todos los contratos; creada por Desarrollador). '
  'Con valor = solo usuarios de ese contrato.';

CREATE TABLE IF NOT EXISTS inicio_novedades_lecturas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  novedad_id BIGINT NOT NULL REFERENCES inicio_novedades (id) ON DELETE CASCADE,
  leido_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, novedad_id)
);

CREATE INDEX IF NOT EXISTS idx_inicio_nov_lect_usuario ON inicio_novedades_lecturas (usuario_id);

COMMENT ON TABLE inicio_novedades_lecturas IS
  'Marca novedades de inicio leídas por usuario (estilo bandeja de entrada).';
