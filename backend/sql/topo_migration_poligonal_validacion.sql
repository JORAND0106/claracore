-- Validación poligonal en 2 niveles (contratista → interventoría), estilo SICOE simplificado.

ALTER TABLE topo_poligonales
  ADD COLUMN IF NOT EXISTS nivel1_estado VARCHAR(20) DEFAULT 'No Revisado',
  ADD COLUMN IF NOT EXISTS nivel1_usuario_id INT,
  ADD COLUMN IF NOT EXISTS nivel1_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nivel2_estado VARCHAR(20) DEFAULT 'No Revisado',
  ADD COLUMN IF NOT EXISTS nivel2_usuario_id INT,
  ADD COLUMN IF NOT EXISTS nivel2_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS biblioteca_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS topo_poligonal_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poligonal_id UUID NOT NULL REFERENCES topo_poligonales(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_topo_pol_com_pol ON topo_poligonal_comentarios(poligonal_id, created_at DESC);
