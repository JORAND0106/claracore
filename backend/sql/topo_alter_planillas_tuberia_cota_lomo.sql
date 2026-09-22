-- Cota Lomo editable en cartera ALCANTARILLA (entre Subrasante y Cota Fondo).
-- Seguro re-ejecutar.
ALTER TABLE topo_planilla_tuberia_filas
  ADD COLUMN IF NOT EXISTS cota_lomo DOUBLE PRECISION;
