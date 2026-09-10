-- ClaraCore — Recursos Humanos: Nómina, novedades, horas extras y liquidación
-- Idempotente.

-- ── Campos del colaborador necesarios para nómina ────────────────────────────
ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS periodicidad text NOT NULL DEFAULT 'mensual'
    CHECK (periodicidad IN ('quincenal', 'mensual')),
  ADD COLUMN IF NOT EXISTS arl_nivel_riesgo text NOT NULL DEFAULT 'I'
    CHECK (arl_nivel_riesgo IN ('I', 'II', 'III', 'IV', 'V')),
  ADD COLUMN IF NOT EXISTS fecha_ingreso date,
  ADD COLUMN IF NOT EXISTS fecha_retiro date;

COMMENT ON COLUMN public.rrhh_trabajadores.periodicidad IS
  'Periodicidad de pago de nómina: quincenal o mensual.';
COMMENT ON COLUMN public.rrhh_trabajadores.arl_nivel_riesgo IS
  'Clase de riesgo ARL (I–V) para aporte patronal.';

-- ── Novedades del periodo ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_novedades (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id     bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  tipo              text NOT NULL
                    CHECK (tipo IN ('ausencia', 'incapacidad', 'licencia')),
  fecha_inicio      date NOT NULL,
  fecha_fin         date NOT NULL,
  dias              numeric(8,2) NOT NULL DEFAULT 0 CHECK (dias >= 0),
  porcentaje_pago   numeric(6,2) NOT NULL DEFAULT 0
                    CHECK (porcentaje_pago >= 0 AND porcentaje_pago <= 100),
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer,
  eliminado_en      timestamptz,
  eliminado_por     integer,
  CONSTRAINT rrhh_novedades_fechas_chk CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS rrhh_novedades_contrato_idx
  ON public.rrhh_novedades (contrato_id, trabajador_id)
  WHERE eliminado_en IS NULL;

ALTER TABLE public.rrhh_novedades ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_novedades'
      AND policyname = 'rrhh_novedades_service'
  ) THEN
    CREATE POLICY rrhh_novedades_service
      ON public.rrhh_novedades FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Horas extras / recargos / bonificaciones ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_horas_extras (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id     bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  tipo              text NOT NULL
                    CHECK (tipo IN (
                      'extra_diurna', 'extra_nocturna',
                      'recargo_nocturno',
                      'dominical_diurna', 'dominical_nocturna',
                      'extra_dominical_diurna', 'extra_dominical_nocturna',
                      'bonificacion'
                    )),
  fecha             date NOT NULL,
  cantidad_horas    numeric(10,2) NOT NULL DEFAULT 0 CHECK (cantidad_horas >= 0),
  valor_fijo        numeric(14,2),
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer,
  eliminado_en      timestamptz,
  eliminado_por     integer
);

CREATE INDEX IF NOT EXISTS rrhh_horas_extras_contrato_idx
  ON public.rrhh_horas_extras (contrato_id, trabajador_id, fecha)
  WHERE eliminado_en IS NULL;

ALTER TABLE public.rrhh_horas_extras ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_horas_extras'
      AND policyname = 'rrhh_horas_extras_service'
  ) THEN
    CREATE POLICY rrhh_horas_extras_service
      ON public.rrhh_horas_extras FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Nóminas por periodo ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_nominas (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  periodicidad      text NOT NULL CHECK (periodicidad IN ('quincenal', 'mensual')),
  anio              integer NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  mes               integer NOT NULL CHECK (mes >= 1 AND mes <= 12),
  quincena          integer CHECK (quincena IS NULL OR quincena IN (1, 2)),
  fecha_inicio      date NOT NULL,
  fecha_fin         date NOT NULL,
  estado            text NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador', 'cerrada', 'anulada')),
  smmlv_usado       numeric(14,2),
  total_devengado   numeric(16,2) NOT NULL DEFAULT 0,
  total_deducciones numeric(16,2) NOT NULL DEFAULT 0,
  total_neto        numeric(16,2) NOT NULL DEFAULT 0,
  total_aportes_patronales numeric(16,2) NOT NULL DEFAULT 0,
  total_provisiones numeric(16,2) NOT NULL DEFAULT 0,
  xlsx_blob_path    text,
  xlsx_nombre       text,
  cerrada_en        timestamptz,
  cerrada_por       integer,
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        integer,
  eliminado_en      timestamptz,
  eliminado_por     integer,
  CONSTRAINT rrhh_nominas_periodo_chk CHECK (
    (periodicidad = 'mensual' AND quincena IS NULL)
    OR (periodicidad = 'quincenal' AND quincena IN (1, 2))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_nominas_periodo_uq
  ON public.rrhh_nominas (contrato_id, periodicidad, anio, mes, COALESCE(quincena, 0))
  WHERE eliminado_en IS NULL AND estado <> 'anulada';

CREATE INDEX IF NOT EXISTS rrhh_nominas_contrato_idx
  ON public.rrhh_nominas (contrato_id, anio DESC, mes DESC)
  WHERE eliminado_en IS NULL;

ALTER TABLE public.rrhh_nominas ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_nominas'
      AND policyname = 'rrhh_nominas_service'
  ) THEN
    CREATE POLICY rrhh_nominas_service
      ON public.rrhh_nominas FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Ítems de nómina (por colaborador) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_nomina_items (
  id                bigserial PRIMARY KEY,
  nomina_id         bigint NOT NULL REFERENCES public.rrhh_nominas(id) ON DELETE CASCADE,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id     bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  salario_base      numeric(14,2) NOT NULL DEFAULT 0,
  salario_periodo   numeric(14,2) NOT NULL DEFAULT 0,
  valor_extras      numeric(14,2) NOT NULL DEFAULT 0,
  valor_recargos    numeric(14,2) NOT NULL DEFAULT 0,
  valor_bonificaciones numeric(14,2) NOT NULL DEFAULT 0,
  descuento_novedades numeric(14,2) NOT NULL DEFAULT 0,
  subsidio_transporte numeric(14,2) NOT NULL DEFAULT 0,
  total_devengado   numeric(14,2) NOT NULL DEFAULT 0,
  deduccion_salud   numeric(14,2) NOT NULL DEFAULT 0,
  deduccion_pension numeric(14,2) NOT NULL DEFAULT 0,
  deduccion_fsp     numeric(14,2) NOT NULL DEFAULT 0,
  total_deducciones numeric(14,2) NOT NULL DEFAULT 0,
  neto_pagar        numeric(14,2) NOT NULL DEFAULT 0,
  aporte_salud_patronal numeric(14,2) NOT NULL DEFAULT 0,
  aporte_pension_patronal numeric(14,2) NOT NULL DEFAULT 0,
  aporte_arl        numeric(14,2) NOT NULL DEFAULT 0,
  aporte_caja       numeric(14,2) NOT NULL DEFAULT 0,
  aporte_sena       numeric(14,2) NOT NULL DEFAULT 0,
  aporte_icbf       numeric(14,2) NOT NULL DEFAULT 0,
  total_aportes_patronales numeric(14,2) NOT NULL DEFAULT 0,
  prov_cesantias    numeric(14,2) NOT NULL DEFAULT 0,
  prov_interes_cesantias numeric(14,2) NOT NULL DEFAULT 0,
  prov_prima        numeric(14,2) NOT NULL DEFAULT 0,
  prov_vacaciones   numeric(14,2) NOT NULL DEFAULT 0,
  total_provisiones numeric(14,2) NOT NULL DEFAULT 0,
  detalle_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  desprendible_blob_path text,
  desprendible_nombre text,
  email_enviado_en  timestamptz,
  email_estado      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_nomina_items_uq
  ON public.rrhh_nomina_items (nomina_id, trabajador_id);

CREATE INDEX IF NOT EXISTS rrhh_nomina_items_trab_idx
  ON public.rrhh_nomina_items (trabajador_id, nomina_id);

ALTER TABLE public.rrhh_nomina_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_nomina_items'
      AND policyname = 'rrhh_nomina_items_service'
  ) THEN
    CREATE POLICY rrhh_nomina_items_service
      ON public.rrhh_nomina_items FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Provisiones acumuladas por colaborador ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_provisiones_acumuladas (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id     bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  cesantias         numeric(16,2) NOT NULL DEFAULT 0,
  interes_cesantias numeric(16,2) NOT NULL DEFAULT 0,
  prima             numeric(16,2) NOT NULL DEFAULT 0,
  vacaciones        numeric(16,2) NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rrhh_provisiones_trab_uq UNIQUE (contrato_id, trabajador_id)
);

ALTER TABLE public.rrhh_provisiones_acumuladas ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_provisiones_acumuladas'
      AND policyname = 'rrhh_provisiones_service'
  ) THEN
    CREATE POLICY rrhh_provisiones_service
      ON public.rrhh_provisiones_acumuladas FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Liquidaciones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_liquidaciones (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id     bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  fecha_retiro      date NOT NULL,
  causa             text,
  salario_pendiente numeric(14,2) NOT NULL DEFAULT 0,
  vacaciones_dinero numeric(14,2) NOT NULL DEFAULT 0,
  cesantias         numeric(14,2) NOT NULL DEFAULT 0,
  interes_cesantias numeric(14,2) NOT NULL DEFAULT 0,
  prima_proporcional numeric(14,2) NOT NULL DEFAULT 0,
  indemnizacion     numeric(14,2) NOT NULL DEFAULT 0,
  total_liquidacion numeric(14,2) NOT NULL DEFAULT 0,
  detalle_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_blob_path     text,
  pdf_nombre        text,
  email_enviado_en  timestamptz,
  email_estado      text,
  estado            text NOT NULL DEFAULT 'generada'
                    CHECK (estado IN ('generada', 'anulada')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer,
  eliminado_en      timestamptz,
  eliminado_por     integer
);

CREATE INDEX IF NOT EXISTS rrhh_liquidaciones_contrato_idx
  ON public.rrhh_liquidaciones (contrato_id, trabajador_id)
  WHERE eliminado_en IS NULL;

ALTER TABLE public.rrhh_liquidaciones ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_liquidaciones'
      AND policyname = 'rrhh_liquidaciones_service'
  ) THEN
    CREATE POLICY rrhh_liquidaciones_service
      ON public.rrhh_liquidaciones FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
