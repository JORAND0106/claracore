-- Huellas de nodo y polígono + auditoría espacial (SicoeObra).
-- Depende de so_eje_franjas.sql / so_auditoria_hallazgos.sql.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS sicoe_radio_nodo_m numeric(8, 2) DEFAULT 1.00;

COMMENT ON COLUMN public.contratos.sicoe_radio_nodo_m IS
  'Radio (m) para pegar puntos al mismo nodo PK_ID. Default 1.00.';

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS geometria_tipo text,
  ADD COLUMN IF NOT EXISTS coords_geojson jsonb,
  ADD COLUMN IF NOT EXISTS huella_tipo text;

COMMENT ON COLUMN public.so_registros.geometria_tipo IS
  'punto | linea | area. Sugiere la plataforma según unidad/coords; el usuario confirma.';
COMMENT ON COLUMN public.so_registros.coords_geojson IS
  'Geometría reportada por el usuario (Point / LineString / Polygon) en GeoJSON.';
COMMENT ON COLUMN public.so_registros.huella_tipo IS
  'Tipo de huella dibujada: franja | nodo | poligono.';

ALTER TABLE public.so_reportes
  ADD COLUMN IF NOT EXISTS perimetro_geojson jsonb;

COMMENT ON COLUMN public.so_reportes.perimetro_geojson IS
  'Perímetro externo opcional del reporte (Polygon). Huella compartida de sus registros de área.';

CREATE TABLE IF NOT EXISTS public.so_nodos_pk (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id_id bigint NOT NULL,
  coord_lat double precision,
  coord_lng double precision,
  poligono_geojson jsonb,
  abs_aprox numeric(14, 4),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_so_nodos_pk_contrato_pk UNIQUE (contrato_id, pk_id_id)
);

CREATE INDEX IF NOT EXISTS idx_so_nodos_pk_contrato
  ON public.so_nodos_pk (contrato_id);

COMMENT ON TABLE public.so_nodos_pk IS
  'Nodo puntual único por PK_ID del contrato. Primera coord oficial; polígono opcional debajo.';

-- Ampliar tipos de hallazgo
ALTER TABLE public.so_auditoria_hallazgos
  DROP CONSTRAINT IF EXISTS so_auditoria_hallazgos_tipo_check;

ALTER TABLE public.so_auditoria_hallazgos
  ADD CONSTRAINT so_auditoria_hallazgos_tipo_check
  CHECK (tipo IN (
    'traslapo',
    'vacio',
    'no_auditable',
    'ubicacion_inconsistente',
    'costado_inconsistente',
    'cantidad_mayor_area'
  ));
