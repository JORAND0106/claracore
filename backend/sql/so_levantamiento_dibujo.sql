-- Levantamiento topográfico sobre plano semáforo (SicoeObra).
-- Reutiliza so_puntos_topograficos; añade WGS84 cache + origen + huella precisa flag.

ALTER TABLE public.so_puntos_topograficos
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'manual';

COMMENT ON COLUMN public.so_puntos_topograficos.lng IS
  'Longitud WGS84 derivada de Este/Norte (EPSG:3116).';
COMMENT ON COLUMN public.so_puntos_topograficos.lat IS
  'Latitud WGS84 derivada de Este/Norte (EPSG:3116).';
COMMENT ON COLUMN public.so_puntos_topograficos.origen IS
  'manual | levantamiento | planilla. Origen de carga del punto.';

CREATE INDEX IF NOT EXISTS idx_so_puntos_topo_reporte
  ON public.so_puntos_topograficos (contrato_id, reporte_id);

-- Marca opcional: huella dibujada desde levantamiento (precisa por definición).
ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS huella_origen text;

COMMENT ON COLUMN public.so_registros.huella_origen IS
  'auto | levantamiento | null. levantamiento = dibujada sobre puntos del topo.';
