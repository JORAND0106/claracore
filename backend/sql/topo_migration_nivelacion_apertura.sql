-- Apertura formal del Circuito de Nivelación (paralelo al cierre).
-- Persiste aunque se guarde la cartera (estado vuelve a borrador).
ALTER TABLE topo_nivelaciones
  ADD COLUMN IF NOT EXISTS circuito_abierto_at TIMESTAMPTZ;
