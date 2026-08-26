-- Ubicación por PK en cartera de nivelación (reutiliza maestro pk_ids del contrato).
ALTER TABLE topo_nivelacion_lecturas
  ADD COLUMN IF NOT EXISTS ubicacion_pk_id TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_pk TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_tramo TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_costado TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_infraestructura TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ubicacion_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_topo_niv_lect_ubicacion_pk
  ON topo_nivelacion_lecturas (ubicacion_pk_id)
  WHERE ubicacion_pk_id IS NOT NULL;
