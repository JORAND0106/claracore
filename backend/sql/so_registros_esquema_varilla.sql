-- Esquema de medición varilla (Kg) en so_registros.
-- es_varilla NULL + unidad Kg = pendiente de recaptura (registros legacy).
-- es_varilla TRUE = Longitud × Peso(kg/m) × Cantidad; diametro_varilla + peso_kg_m.
-- es_varilla FALSE = esquema estándar Longitud × Ancho × Espesor × Cantidad.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS es_varilla boolean,
  ADD COLUMN IF NOT EXISTS diametro_varilla text,
  ADD COLUMN IF NOT EXISTS peso_kg_m numeric(10, 2);

COMMENT ON COLUMN public.so_registros.es_varilla IS
  'Kg: TRUE=varilla NTC 2289, FALSE=no varilla, NULL=pendiente recaptura (legacy).';
COMMENT ON COLUMN public.so_registros.diametro_varilla IS
  'Diámetro en fracciones de pulgada (p. ej. 3/8, 1 1/4). Solo si es_varilla.';
COMMENT ON COLUMN public.so_registros.peso_kg_m IS
  'Peso kg/m lineal NTC 2289 (2 dp), derivado de diametro_varilla. Solo si es_varilla.';

CREATE INDEX IF NOT EXISTS idx_so_registros_es_varilla_null_kg
  ON public.so_registros (contrato_id)
  WHERE es_varilla IS NULL;
