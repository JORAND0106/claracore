-- ClaraCore — RRHH: correcciones formulario (catálogo reutilizable, tipo_contrato texto)
-- Idempotente. Elimina rrhh_tipos_contrato a favor de rrhh_catalogo_opciones.

-- ── Catálogo reutilizable de opciones (EPS, ARL, cargo, tipo_contrato, etc.) ──
CREATE TABLE IF NOT EXISTS public.rrhh_catalogo_opciones (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  categoria             text NOT NULL
                        CHECK (categoria IN (
                          'eps', 'pension', 'cesantias', 'arl',
                          'caja_compensacion', 'cargo', 'tipo_contrato'
                        )),
  valor                 text NOT NULL,
  valor_norm            text NOT NULL,
  activo                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT rrhh_catalogo_opciones_valor_chk CHECK (char_length(trim(valor)) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_catalogo_opciones_uq
  ON public.rrhh_catalogo_opciones (contrato_id, categoria, valor_norm);

CREATE INDEX IF NOT EXISTS rrhh_catalogo_opciones_cat_idx
  ON public.rrhh_catalogo_opciones (contrato_id, categoria)
  WHERE activo = true;

COMMENT ON TABLE public.rrhh_catalogo_opciones IS
  'Listas reutilizables RRHH: afiliaciones, cargo y tipo de contrato (agregar sin duplicar).';

ALTER TABLE public.rrhh_catalogo_opciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_catalogo_opciones'
      AND policyname = 'rrhh_catalogo_opciones_service'
  ) THEN
    CREATE POLICY rrhh_catalogo_opciones_service
      ON public.rrhh_catalogo_opciones
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Trabajadores: tipo_contrato como texto (deja de usar FK a rrhh_tipos_contrato) ─
ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS tipo_contrato text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rrhh_trabajadores'
      AND column_name = 'tipo_contrato_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rrhh_tipos_contrato'
  ) THEN
    UPDATE public.rrhh_trabajadores t
    SET tipo_contrato = tc.nombre
    FROM public.rrhh_tipos_contrato tc
    WHERE t.tipo_contrato_id = tc.id
      AND (t.tipo_contrato IS NULL OR trim(t.tipo_contrato) = '');
  END IF;
END $$;

-- Migrar tipos del catálogo dedicado → opciones reutilizables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rrhh_tipos_contrato'
  ) THEN
    INSERT INTO public.rrhh_catalogo_opciones (contrato_id, categoria, valor, valor_norm, activo, created_by)
    SELECT
      tc.contrato_id,
      'tipo_contrato',
      trim(tc.nombre),
      lower(trim(tc.nombre)),
      coalesce(tc.activo, true),
      tc.created_by
    FROM public.rrhh_tipos_contrato tc
    WHERE char_length(trim(tc.nombre)) >= 1
    ON CONFLICT (contrato_id, categoria, valor_norm) DO NOTHING;
  END IF;
END $$;

-- Incorporar tipos ya usados en FOAC/SST (si la tabla existe) como catálogo de plataforma
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sst_personal_importado'
  ) THEN
    INSERT INTO public.rrhh_catalogo_opciones (contrato_id, categoria, valor, valor_norm, activo)
    SELECT DISTINCT
      s.contrato_id,
      'tipo_contrato',
      trim(s.tipo_contrato),
      lower(trim(s.tipo_contrato)),
      true
    FROM public.sst_personal_importado s
    WHERE s.tipo_contrato IS NOT NULL
      AND char_length(trim(s.tipo_contrato)) >= 1
    ON CONFLICT (contrato_id, categoria, valor_norm) DO NOTHING;
  END IF;
END $$;

-- Quitar FK / columna tipo_contrato_id de trabajadores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rrhh_trabajadores'
      AND column_name = 'tipo_contrato_id'
  ) THEN
    ALTER TABLE public.rrhh_trabajadores DROP COLUMN tipo_contrato_id;
  END IF;
END $$;

-- Contratos generados: mantener snapshot por nombre; soltar FK al catálogo dedicado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rrhh_contratos_generados'
      AND column_name = 'tipo_contrato_id'
  ) THEN
    ALTER TABLE public.rrhh_contratos_generados DROP COLUMN tipo_contrato_id;
  END IF;
END $$;

-- Eliminar catálogo dedicado de tipos de contrato RRHH
DROP TABLE IF EXISTS public.rrhh_tipos_contrato CASCADE;

NOTIFY pgrst, 'reload schema';
