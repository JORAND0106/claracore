-- Dibujo por reporte (huella compartida de todos sus registros).
-- Depende de so_huellas_nodo_poligono.sql (perimetro_geojson ya existe).

ALTER TABLE public.so_reportes
  ADD COLUMN IF NOT EXISTS dibujo_geojson jsonb,
  ADD COLUMN IF NOT EXISTS dibujo_escena jsonb,
  ADD COLUMN IF NOT EXISTS dibujo_actualizado_en timestamptz,
  ADD COLUMN IF NOT EXISTS dibujo_por bigint;

COMMENT ON COLUMN public.so_reportes.dibujo_geojson IS
  'FeatureCollection GeoJSON del dibujo del reporte. Se propaga como huella a todos sus registros.';
COMMENT ON COLUMN public.so_reportes.dibujo_escena IS
  'Escena del editor de esquema (objetos) para reabrir y editar el dibujo.';
COMMENT ON COLUMN public.so_reportes.dibujo_actualizado_en IS
  'Última vez que se guardó o editó el dibujo del reporte.';
COMMENT ON COLUMN public.so_reportes.dibujo_por IS
  'Usuario que guardó el dibujo del reporte.';

CREATE INDEX IF NOT EXISTS idx_so_reportes_contrato_sin_dibujo
  ON public.so_reportes (contrato_id)
  WHERE dibujo_geojson IS NULL;
