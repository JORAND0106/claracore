-- ClaraCore — Módulo RRHH: Documentación para contratación (fase 1)
-- Independiente de Bitácora y Subcontratistas. Idempotente.

-- ── Función en matriz Control de accesos ─────────────────────────────────────
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'RRHH', 'RRHH', 'Gestión'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(f.nombre::text, ''))) = 'rrhh'
);

-- Seed permisos totales al cargo Desarrollador (si existe)
DO $$
DECLARE
  v_func_id integer;
  v_cargo_id integer;
BEGIN
  SELECT id INTO v_func_id FROM public.funciones
  WHERE upper(trim(coalesce(codigo::text, ''))) = 'RRHH'
     OR lower(trim(coalesce(nombre::text, ''))) = 'rrhh'
  LIMIT 1;

  SELECT id INTO v_cargo_id FROM public.cargos
  WHERE lower(trim(coalesce(nombre::text, ''))) = 'desarrollador'
  LIMIT 1;

  IF v_func_id IS NULL OR v_cargo_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.permisos
    WHERE cargo_id = v_cargo_id AND funcion_id = v_func_id AND contrato_id IS NULL
  ) THEN
    INSERT INTO public.permisos (
      cargo_id, funcion_id, contrato_id,
      ver, crear, editar, eliminar, validar, exportar
    ) VALUES (
      v_cargo_id, v_func_id, NULL,
      true, true, true, true, true, true
    );
  END IF;
END $$;

-- ── Catálogo de tipos de contrato laboral ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_tipos_contrato (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  descripcion           text,
  activo                boolean NOT NULL DEFAULT true,
  orden                 integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at            timestamptz,
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT rrhh_tipos_contrato_nombre_chk CHECK (char_length(trim(nombre)) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_tipos_contrato_nombre_uq
  ON public.rrhh_tipos_contrato (contrato_id, lower(trim(nombre)));

CREATE INDEX IF NOT EXISTS rrhh_tipos_contrato_contrato_idx
  ON public.rrhh_tipos_contrato (contrato_id, activo, orden);

COMMENT ON TABLE public.rrhh_tipos_contrato IS
  'Catálogo configurable de tipos de contrato laboral por contrato de obra (RRHH).';

-- ── Trabajadores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_trabajadores (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  -- Datos personales
  nombres               text NOT NULL,
  apellidos             text NOT NULL,
  tipo_documento        text NOT NULL DEFAULT 'CC',
  numero_documento      text NOT NULL,
  fecha_nacimiento      date,
  genero                text,
  direccion             text,
  ciudad                text,
  telefono              text,
  email                 text,
  -- Contacto de emergencia
  emergencia_nombre     text,
  emergencia_parentesco text,
  emergencia_telefono   text,
  -- Afiliaciones seguridad social
  eps                   text,
  pension               text,
  cesantias             text,
  arl                   text,
  caja_compensacion     text,
  -- Condiciones laborales aspiradas
  cargo_aspira          text,
  salario               numeric(18, 2),
  subsidio_transporte   boolean NOT NULL DEFAULT false,
  tipo_contrato_id      bigint REFERENCES public.rrhh_tipos_contrato(id) ON DELETE SET NULL,
  -- Empresa contratante (snapshot; sin FK a subcontratistas en esta fase)
  empresa_tipo          text NOT NULL DEFAULT 'consorcio'
                        CHECK (empresa_tipo IN ('consorcio', 'subcontratista')),
  empresa_nombre        text NOT NULL,
  empresa_nit           text,
  empresa_subcontratista_id integer,
  -- Estado
  estado                text NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo', 'retirado')),
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at            timestamptz,
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  eliminado_en          timestamptz,
  eliminado_por         integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT rrhh_trabajadores_doc_chk CHECK (char_length(trim(numero_documento)) >= 3),
  CONSTRAINT rrhh_trabajadores_nombres_chk CHECK (char_length(trim(nombres)) >= 1),
  CONSTRAINT rrhh_trabajadores_apellidos_chk CHECK (char_length(trim(apellidos)) >= 1),
  CONSTRAINT rrhh_trabajadores_empresa_chk CHECK (char_length(trim(empresa_nombre)) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_trabajadores_doc_uq
  ON public.rrhh_trabajadores (contrato_id, lower(trim(tipo_documento)), lower(trim(numero_documento)))
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS rrhh_trabajadores_contrato_idx
  ON public.rrhh_trabajadores (contrato_id)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS rrhh_trabajadores_empresa_idx
  ON public.rrhh_trabajadores (contrato_id, empresa_tipo)
  WHERE eliminado_en IS NULL;

COMMENT ON TABLE public.rrhh_trabajadores IS
  'Registro individual de trabajadores (RRHH · Documentación para contratación).';

COMMENT ON COLUMN public.rrhh_trabajadores.empresa_subcontratista_id IS
  'Referencia blanda al id de subcontratista al momento del alta; sin FK en fase 1.';

-- ── Documentos versionados (soporte e ingreso) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_trabajador_documentos (
  id                    bigserial PRIMARY KEY,
  trabajador_id         bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  categoria             text NOT NULL
                        CHECK (categoria IN ('soporte', 'ingreso')),
  tipo                  text NOT NULL,
  tipo_otro_texto       text,
  version_label         text,
  vigente               boolean NOT NULL DEFAULT true,
  azure_blob_path       text NOT NULL,
  nombre_archivo        varchar(255) NOT NULL,
  mime_type             text NOT NULL,
  tamano_bytes          bigint NOT NULL CHECK (tamano_bytes > 0),
  hash_sha256           varchar(64),
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  eliminado_en          timestamptz,
  eliminado_por         integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT rrhh_trabajador_documentos_tipo_chk CHECK (char_length(trim(tipo)) >= 2)
);

CREATE INDEX IF NOT EXISTS rrhh_trabajador_docs_trab_cat_idx
  ON public.rrhh_trabajador_documentos (trabajador_id, categoria, tipo)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS rrhh_trabajador_docs_vigente_idx
  ON public.rrhh_trabajador_documentos (trabajador_id, categoria, tipo)
  WHERE eliminado_en IS NULL AND vigente = true;

COMMENT ON TABLE public.rrhh_trabajador_documentos IS
  'Documentos de soporte e ingreso del trabajador con historial versionado (RRHH).';

-- ── Contratos laborales generados (PDF) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_contratos_generados (
  id                    bigserial PRIMARY KEY,
  trabajador_id         bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo_contrato_id      bigint REFERENCES public.rrhh_tipos_contrato(id) ON DELETE SET NULL,
  tipo_contrato_nombre  text NOT NULL,
  numero_contrato_laboral text,
  fecha_inicio          date,
  fecha_fin             date,
  version_num           integer NOT NULL DEFAULT 1,
  vigente               boolean NOT NULL DEFAULT true,
  azure_blob_path       text NOT NULL,
  nombre_archivo        varchar(255) NOT NULL,
  mime_type             text NOT NULL DEFAULT 'application/pdf',
  tamano_bytes          bigint NOT NULL CHECK (tamano_bytes > 0),
  estado                text NOT NULL DEFAULT 'generado'
                        CHECK (estado IN ('generado', 'firmado', 'anulado')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  eliminado_en          timestamptz,
  eliminado_por         integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS rrhh_contratos_gen_trab_idx
  ON public.rrhh_contratos_generados (trabajador_id)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS rrhh_contratos_gen_vigente_idx
  ON public.rrhh_contratos_generados (trabajador_id)
  WHERE eliminado_en IS NULL AND vigente = true;

COMMENT ON TABLE public.rrhh_contratos_generados IS
  'Contratos laborales PDF generados desde plantilla con placeholders (RRHH).';

-- ── RLS (defensa en profundidad; acceso real vía service role / API) ─────────
ALTER TABLE public.rrhh_tipos_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_trabajador_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_contratos_generados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_tipos_contrato'
      AND policyname = 'rrhh_tipos_contrato_service'
  ) THEN
    CREATE POLICY rrhh_tipos_contrato_service
      ON public.rrhh_tipos_contrato
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_trabajadores'
      AND policyname = 'rrhh_trabajadores_service'
  ) THEN
    CREATE POLICY rrhh_trabajadores_service
      ON public.rrhh_trabajadores
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_trabajador_documentos'
      AND policyname = 'rrhh_trabajador_documentos_service'
  ) THEN
    CREATE POLICY rrhh_trabajador_documentos_service
      ON public.rrhh_trabajador_documentos
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_contratos_generados'
      AND policyname = 'rrhh_contratos_generados_service'
  ) THEN
    CREATE POLICY rrhh_contratos_generados_service
      ON public.rrhh_contratos_generados
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
