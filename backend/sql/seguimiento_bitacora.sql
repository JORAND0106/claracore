-- ClaraCore — Bitácora de Obra (Reporte Diario + Reporte de Evento) dentro de Seguimiento.
-- Idempotente. Prefijo seguimiento_bitacora_* para no colisionar con legacy.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'BITACORA', 'Bitácora', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'bitácora'
     OR lower(trim(f.nombre)) = 'bitacora'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'BITACORA')
);

-- Permisos seed: cargo Desarrollador → Bitácora (todas las acciones).
INSERT INTO public.permisos (
  cargo_id, funcion_id,
  ver, crear, editar, eliminar, validar, exportar,
  contrato_id
)
SELECT
  c.id,
  f.id,
  true, true, true, true, true, true,
  NULL
FROM public.cargos c
CROSS JOIN public.funciones f
WHERE lower(trim(c.nombre)) = 'desarrollador'
  AND (
    lower(trim(f.nombre)) IN ('bitácora', 'bitacora')
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'BITACORA')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.permisos p
    WHERE p.cargo_id = c.id
      AND p.funcion_id = f.id
      AND p.contrato_id IS NULL
  );

UPDATE public.permisos p
SET
  ver = true,
  crear = true,
  editar = true,
  eliminar = true,
  validar = true,
  exportar = true
FROM public.cargos c
JOIN public.funciones f ON true
WHERE p.cargo_id = c.id
  AND p.funcion_id = f.id
  AND lower(trim(c.nombre)) = 'desarrollador'
  AND (
    lower(trim(f.nombre)) IN ('bitácora', 'bitacora')
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'BITACORA')
  );

-- Catálogo reutilizable de maquinaria / equipos / volquetas por contrato.
CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_equipo (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  nombre_norm   text NOT NULL,
  tipo          text NOT NULL DEFAULT 'equipo'
                CHECK (tipo IN ('maquina', 'equipo', 'volqueta', 'otro')),
  activo        boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_bitacora_equipo IS
  'Catálogo de maquinaria/equipos/volquetas de Bitácora por contrato (registro manual la 1ª vez, luego reutilizable).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_equipo_contrato_nombre
  ON public.seguimiento_bitacora_equipo (contrato_id, nombre_norm)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_equipo_contrato_activo
  ON public.seguimiento_bitacora_equipo (contrato_id)
  WHERE activo = true;

-- Entradas del hilo cronológico (Reporte Diario | Reporte de Evento).
CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_entrada (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo                  text NOT NULL CHECK (tipo IN ('diario', 'evento')),
  fecha                 date NOT NULL,
  -- diario: abierto mientras se edita; cerrado = inmutable.
  -- evento: siempre cerrado desde la creación.
  estado                text NOT NULL DEFAULT 'abierto'
                        CHECK (estado IN ('abierto', 'cerrado')),
  cerrado_en            timestamptz,
  cerrado_por           integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cierre_motivo         text CHECK (cierre_motivo IS NULL OR cierre_motivo IN ('manual', 'automatico_dia', 'creacion_evento')),
  hora_inicio_labores   time,
  clima_codigo          integer,
  clima_temp_c          numeric(6, 2),
  clima_descripcion     text,
  clima_editado_manual  boolean NOT NULL DEFAULT false,
  personal              jsonb NOT NULL DEFAULT '[]'::jsonb,
  tramo                 text,
  evento_tipo           text
                        CHECK (
                          evento_tipo IS NULL
                          OR evento_tipo IN (
                            'visita_terceros',
                            'incidente_sst',
                            'reporte_actividades',
                            'novedades'
                          )
                        ),
  evento_detalle        jsonb NOT NULL DEFAULT '{}'::jsonb,
  cuerpo_html           text NOT NULL DEFAULT '',
  imagenes              jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_by_nombre     text,
  created_by_rol        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seg_bitacora_evento_tipo_chk CHECK (
    (tipo = 'diario' AND evento_tipo IS NULL)
    OR (tipo = 'evento' AND evento_tipo IS NOT NULL)
  )
);

COMMENT ON TABLE public.seguimiento_bitacora_entrada IS
  'Bitácora de Obra: hilo cronológico compartido por contrato (Reporte Diario + Reporte de Evento).';

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.personal IS
  '[{cargo, cantidad, cargo_otro?}]. Cargos plantilla + Otro.';

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.imagenes IS
  'Máx. 4 fotos/gráficos [{nombre, blob_path, mime_type, content_hash, origen, created_at}].';

-- Un solo Reporte Diario por fecha por tramo por contrato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_diario_contrato_fecha_tramo
  ON public.seguimiento_bitacora_entrada (contrato_id, fecha, (COALESCE(tramo, '')))
  WHERE tipo = 'diario';

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_entrada_contrato_fecha
  ON public.seguimiento_bitacora_entrada (contrato_id, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_entrada_abiertos
  ON public.seguimiento_bitacora_entrada (contrato_id, fecha)
  WHERE tipo = 'diario' AND estado = 'abierto';

-- Usos de maquinaria/equipo en un Reporte Diario.
CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_equipo_uso (
  id                 bigserial PRIMARY KEY,
  entrada_id         bigint NOT NULL REFERENCES public.seguimiento_bitacora_entrada(id) ON DELETE CASCADE,
  equipo_id          bigint REFERENCES public.seguimiento_bitacora_equipo(id) ON DELETE SET NULL,
  equipo_nombre      text NOT NULL,
  operador           text,
  cantidad           numeric(12, 2) NOT NULL DEFAULT 1,
  hora_inicio        time,
  hora_fin           time,
  horas_intermedias  jsonb NOT NULL DEFAULT '[]'::jsonb,
  orden              integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.seguimiento_bitacora_equipo_uso.horas_intermedias IS
  'Paradas intermedias [{hora, nota?}].';

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_equipo_uso_entrada
  ON public.seguimiento_bitacora_equipo_uso (entrada_id, orden);

-- Hashes de fotos de bitácora (detección de duplicados por contrato).
CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_foto_hash (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  content_hash  text NOT NULL,
  blob_path     text,
  entrada_id    bigint REFERENCES public.seguimiento_bitacora_entrada(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seg_bitacora_foto_hash UNIQUE (contrato_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_foto_hash_contrato
  ON public.seguimiento_bitacora_foto_hash (contrato_id);

NOTIFY pgrst, 'reload schema';
