-- ClaraCore — Módulo Seguimiento: actas de reunión, compromisos y tareas personales.
-- Idempotente. Evita colisión con legacy `actas` (SICOE/RPO) usando prefijo seguimiento_*.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'SEGUIMIENTO', 'Seguimiento', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'seguimiento'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
);

-- Permisos seed: cargo Desarrollador → Seguimiento (todas las acciones).
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
    lower(trim(f.nombre)) = 'seguimiento'
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
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
    lower(trim(f.nombre)) = 'seguimiento'
    OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
  );

-- ── Actas de reunión ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seguimiento_acta (
  id                  bigserial PRIMARY KEY,
  contrato_id         integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  consecutivo         integer NOT NULL,
  fecha_reunion       date NOT NULL,
  ubicacion           text,
  orden_del_dia       text,
  elaborador_id       integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  elaborador_nombre   text,
  estado              text NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador', 'en_firma', 'firmada', 'cerrada')),
  pdf_blob_path       text,
  contenido_hash      text,
  created_by          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_acta_consecutivo_uq UNIQUE (contrato_id, consecutivo)
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_contrato_fecha
  ON public.seguimiento_acta (contrato_id, fecha_reunion DESC);

COMMENT ON TABLE public.seguimiento_acta IS
  'Actas de reunión del módulo Seguimiento (numeración consecutiva por contrato).';

CREATE TABLE IF NOT EXISTS public.seguimiento_acta_asistente (
  id            bigserial PRIMARY KEY,
  acta_id       bigint NOT NULL REFERENCES public.seguimiento_acta(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  cargo         text,
  entidad       text,
  usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  orden         integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_asistente_acta
  ON public.seguimiento_acta_asistente (acta_id);

CREATE TABLE IF NOT EXISTS public.seguimiento_acta_idea (
  id            bigserial PRIMARY KEY,
  acta_id       bigint NOT NULL REFERENCES public.seguimiento_acta(id) ON DELETE CASCADE,
  orden         integer NOT NULL DEFAULT 0,
  texto         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_idea_acta
  ON public.seguimiento_acta_idea (acta_id, orden);

CREATE TABLE IF NOT EXISTS public.seguimiento_acta_apartado (
  id            bigserial PRIMARY KEY,
  acta_id       bigint NOT NULL REFERENCES public.seguimiento_acta(id) ON DELETE CASCADE,
  titulo        text,
  contenido     text,
  orden         integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_apartado_acta
  ON public.seguimiento_acta_apartado (acta_id, orden);

-- ── Ítems unificados (compromisos de acta + tareas personales) ───────────────
CREATE TABLE IF NOT EXISTS public.seguimiento_item (
  id                          bigserial PRIMARY KEY,
  origen                      text NOT NULL
                              CHECK (origen IN ('compromiso', 'tarea')),
  titulo                      text NOT NULL,
  descripcion                 text,
  estado_gestion              text NOT NULL DEFAULT 'abierto'
                              CHECK (estado_gestion IN (
                                'abierto', 'en_progreso', 'cumplido', 'parcial',
                                'vencido', 'cancelado'
                              )),
  asignado_a_id               integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  asignado_a_nombre           text,
  created_by                  integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento           date,
  -- Compromiso de acta
  contrato_id                 integer REFERENCES public.contratos(id) ON DELETE CASCADE,
  acta_id                     bigint REFERENCES public.seguimiento_acta(id) ON DELETE SET NULL,
  idea_id                     bigint REFERENCES public.seguimiento_acta_idea(id) ON DELETE SET NULL,
  solicitante_id              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  solicitante_nombre          text,
  fecha_vencimiento_original  date,
  fecha_limite_gracia         timestamptz,
  vencido_at                  timestamptz,
  llamado_atencion_generado   boolean NOT NULL DEFAULT false,
  -- Tarea personal
  campos_libres               jsonb NOT NULL DEFAULT '{}'::jsonb,
  imagenes                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT seguimiento_item_compromiso_req CHECK (
    origen <> 'compromiso'
    OR (contrato_id IS NOT NULL AND acta_id IS NOT NULL AND solicitante_id IS NOT NULL
        AND asignado_a_id IS NOT NULL AND fecha_vencimiento IS NOT NULL)
  ),
  CONSTRAINT seguimiento_item_tarea_req CHECK (
    origen <> 'tarea' OR created_by IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_bandeja
  ON public.seguimiento_item (asignado_a_id, estado_gestion, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_contrato
  ON public.seguimiento_item (contrato_id, origen) WHERE contrato_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_acta
  ON public.seguimiento_item (acta_id) WHERE acta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_created_by
  ON public.seguimiento_item (created_by, origen);

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_gracia
  ON public.seguimiento_item (fecha_limite_gracia)
  WHERE origen = 'compromiso' AND llamado_atencion_generado = false;

COMMENT ON TABLE public.seguimiento_item IS
  'Bandeja unificada: compromisos generados desde actas y tareas personales.';

CREATE TABLE IF NOT EXISTS public.seguimiento_item_comentario (
  id              bigserial PRIMARY KEY,
  item_id         bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  autor_id        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autor_nombre    text,
  mensaje         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_comentario_item
  ON public.seguimiento_item_comentario (item_id, created_at);

CREATE TABLE IF NOT EXISTS public.seguimiento_item_evidencia (
  id              bigserial PRIMARY KEY,
  item_id         bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  uploaded_by     integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nombre_archivo  text NOT NULL,
  blob_path       text NOT NULL,
  mime_type       text,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_evidencia_item
  ON public.seguimiento_item_evidencia (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seguimiento_justificacion (
  id                        bigserial PRIMARY KEY,
  item_id                   bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  solicitado_por_id         integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo                    text NOT NULL,
  nueva_fecha_vencimiento   date NOT NULL,
  estado                    text NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  revisado_por_id           integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  revisado_at               timestamptz,
  comentario_revision       text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_justificacion_item
  ON public.seguimiento_justificacion (item_id, created_at DESC);

-- Eventos de gestión para gamificación futura (sin cálculo de puntaje aquí)
CREATE TABLE IF NOT EXISTS public.seguimiento_evento_gestion (
  id            bigserial PRIMARY KEY,
  item_id       bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  tipo_evento   text NOT NULL,
  usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_evento_item
  ON public.seguimiento_evento_gestion (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seguimiento_evento_tipo
  ON public.seguimiento_evento_gestion (tipo_evento, created_at DESC);

COMMENT ON TABLE public.seguimiento_evento_gestion IS
  'Registro de eventos de gestión (cumplimiento, demora, vencimiento) para puntuación futura.';

CREATE TABLE IF NOT EXISTS public.seguimiento_llamado_atencion (
  id              bigserial PRIMARY KEY,
  item_id         bigint NOT NULL REFERENCES public.seguimiento_item(id) ON DELETE CASCADE,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pdf_blob_path   text NOT NULL,
  generado_at     timestamptz NOT NULL DEFAULT now(),
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_llamado_item
  ON public.seguimiento_llamado_atencion (item_id);

CREATE TABLE IF NOT EXISTS public.seguimiento_firma_registro (
  id                bigserial PRIMARY KEY,
  acta_id           bigint NOT NULL REFERENCES public.seguimiento_acta(id) ON DELETE CASCADE,
  asistente_id      bigint REFERENCES public.seguimiento_acta_asistente(id) ON DELETE SET NULL,
  usuario_id        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  slot_label        text,
  firma_imagen_url  text,
  firmado_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_firma_acta_asistente_uq UNIQUE (acta_id, asistente_id)
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_firma_acta
  ON public.seguimiento_firma_registro (acta_id);

ALTER TABLE public.seguimiento_acta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_acta_asistente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_acta_idea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_acta_apartado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_item_comentario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_item_evidencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_justificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_evento_gestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_llamado_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_firma_registro ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
