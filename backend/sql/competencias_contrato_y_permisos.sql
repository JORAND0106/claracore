-- Ejecutar en Supabase SQL Editor (una vez).
-- 1) Competencias por contrato (compartidas entre usuarios del mismo contrato)
-- 2) Permisos por contrato (matriz no se mezcla entre contratos)

CREATE TABLE IF NOT EXISTS competencias_contrato (
  id BIGSERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contrato_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_competencias_contrato_cid ON competencias_contrato(contrato_id);

-- Semilla ICCU en contratos existentes (idempotente)
INSERT INTO competencias_contrato (contrato_id, nombre)
SELECT c.id, 'ICCU'
FROM contratos c
ON CONFLICT (contrato_id, nombre) DO NOTHING;

-- Permisos: columna contrato_id (NULL = plantilla legacy; preferir filas con contrato_id)
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_permisos_cargo_contrato ON permisos(cargo_id, contrato_id);

-- Opcional: copiar permisos actuales al contrato que indiques (ajusta :contrato_id_origen)
-- UPDATE permisos SET contrato_id = 2 WHERE contrato_id IS NULL;

-- IMPORTANTE: después ejecutar también permisos_unique_por_contrato.sql
-- (permite matrices distintas por contrato sin error duplicate key).
