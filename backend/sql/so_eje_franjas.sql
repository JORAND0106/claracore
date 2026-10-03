-- Eje / franjas lineales SicoeObra + tipos de hallazgos de ubicación/costado.
-- Depende de so_auditoria_hallazgos.sql (tabla de hallazgos).

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS sicoe_tolerancia_ubicacion_m numeric(8, 2) DEFAULT 1.00;

COMMENT ON COLUMN public.contratos.sicoe_tolerancia_ubicacion_m IS
  'Tolerancia (m) entre abscisa digitada y abscisa proyectada desde coordenadas. Default 1.00.';

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS coord_lat_fin double precision,
  ADD COLUMN IF NOT EXISTS coord_lng_fin double precision,
  ADD COLUMN IF NOT EXISTS huella_geojson jsonb,
  ADD COLUMN IF NOT EXISTS huella_precision text;

COMMENT ON COLUMN public.so_registros.coord_lat_fin IS
  'Latitud WGS84 del extremo final (opcional). coord_lat/lng = inicio o punto único.';
COMMENT ON COLUMN public.so_registros.coord_lng_fin IS
  'Longitud WGS84 del extremo final (opcional).';
COMMENT ON COLUMN public.so_registros.huella_geojson IS
  'GeoJSON Feature (Polygon franja) dibujado automáticamente sobre el eje del abscisado.';
COMMENT ON COLUMN public.so_registros.huella_precision IS
  'precisa | aproximada | null. Precisa usa coords proyectadas; aproximada solo abscisas+costado.';

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_huella
  ON public.so_registros (contrato_id)
  WHERE huella_geojson IS NOT NULL;

-- Ampliar tipos de hallazgo (requiere recrear CHECK).
ALTER TABLE public.so_auditoria_hallazgos
  DROP CONSTRAINT IF EXISTS so_auditoria_hallazgos_tipo_check;

ALTER TABLE public.so_auditoria_hallazgos
  ADD CONSTRAINT so_auditoria_hallazgos_tipo_check
  CHECK (tipo IN (
    'traslapo',
    'vacio',
    'no_auditable',
    'ubicacion_inconsistente',
    'costado_inconsistente'
  ));
