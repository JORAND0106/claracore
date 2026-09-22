-- Validación dual (contratista → interventoría) para planillas de tubería.
-- Misma semántica que poligonales/nivelaciones: nivel1 / nivel2 + comentario de interventoría.

ALTER TABLE topo_planillas_tuberia
  ADD COLUMN IF NOT EXISTS nivel1_estado VARCHAR(20) NOT NULL DEFAULT 'No Revisado',
  ADD COLUMN IF NOT EXISTS nivel1_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS nivel1_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nivel2_estado VARCHAR(20) NOT NULL DEFAULT 'No Revisado',
  ADD COLUMN IF NOT EXISTS nivel2_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS nivel2_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comentario_interventoria TEXT,
  ADD COLUMN IF NOT EXISTS comentario_interventoria_at TIMESTAMPTZ;

COMMENT ON COLUMN topo_planillas_tuberia.nivel1_estado IS 'Validación contratista: No Revisado | Aprobado | Pendiente | Rechazado';
COMMENT ON COLUMN topo_planillas_tuberia.nivel2_estado IS 'Validación interventoría (solo tras N1 Aprobado)';
COMMENT ON COLUMN topo_planillas_tuberia.comentario_interventoria IS 'Último comentario de interventoría; visible en la cartera';
