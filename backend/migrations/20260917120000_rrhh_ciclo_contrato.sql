-- ClaraCore — RRHH: ciclo de contrato laboral (renovación, prueba, reingreso, Administrativo)
-- Idempotente.

-- ── Cargo Administrativo (fila independiente en Control de accesos) ─────────
INSERT INTO public.cargos (nombre)
SELECT 'Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos c WHERE lower(trim(c.nombre)) = 'administrativo'
);

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
WHERE lower(trim(c.nombre)) = 'administrativo'
  AND (upper(trim(f.codigo::text)) = 'RRHH' OR lower(trim(f.nombre)) = 'recursos humanos')
  AND NOT EXISTS (
    SELECT 1
    FROM public.permisos p
    WHERE p.cargo_id = c.id
      AND p.funcion_id = f.id
      AND p.contrato_id IS NULL
  );

-- ── Campos de ciclo laboral en el trabajador ────────────────────────────────
ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS requiere_renovacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodicidad_renovacion_meses integer,
  ADD COLUMN IF NOT EXISTS periodo_prueba_dias integer,
  ADD COLUMN IF NOT EXISTS fecha_fin_periodo_prueba date,
  ADD COLUMN IF NOT EXISTS fecha_fin_contrato date,
  ADD COLUMN IF NOT EXISTS renovacion_otrosi_at timestamptz,
  ADD COLUMN IF NOT EXISTS ciclo_documental integer NOT NULL DEFAULT 1;

ALTER TABLE public.rrhh_trabajadores
  DROP CONSTRAINT IF EXISTS rrhh_trabajadores_periodicidad_renov_chk;
ALTER TABLE public.rrhh_trabajadores
  ADD CONSTRAINT rrhh_trabajadores_periodicidad_renov_chk
  CHECK (
    periodicidad_renovacion_meses IS NULL
    OR periodicidad_renovacion_meses IN (1, 2, 3, 6, 12)
  );

ALTER TABLE public.rrhh_trabajadores
  DROP CONSTRAINT IF EXISTS rrhh_trabajadores_prueba_dias_chk;
ALTER TABLE public.rrhh_trabajadores
  ADD CONSTRAINT rrhh_trabajadores_prueba_dias_chk
  CHECK (periodo_prueba_dias IS NULL OR periodo_prueba_dias > 0);

COMMENT ON COLUMN public.rrhh_trabajadores.requiere_renovacion IS
  'Si el contrato a término fijo exige renovación periódica.';
COMMENT ON COLUMN public.rrhh_trabajadores.ciclo_documental IS
  'Ciclo de documentación laboral; se incrementa en cada reingreso.';

-- ── Origen del PDF (generado vs cargado) y marca de otrosí ───────────────────
ALTER TABLE public.rrhh_contratos_generados
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'generado',
  ADD COLUMN IF NOT EXISTS es_otrosi boolean NOT NULL DEFAULT false;

ALTER TABLE public.rrhh_contratos_generados
  DROP CONSTRAINT IF EXISTS rrhh_contratos_gen_origen_chk;
ALTER TABLE public.rrhh_contratos_generados
  ADD CONSTRAINT rrhh_contratos_gen_origen_chk
  CHECK (origen IN ('generado', 'cargado'));

-- ── Log de alertas (evita duplicar notificaciones SISTEMA) ───────────────────
CREATE TABLE IF NOT EXISTS public.rrhh_alerta_log (
  id              bigserial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id   bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  tipo            text NOT NULL
                  CHECK (tipo IN ('vencimiento_35', 'vencimiento_10', 'periodo_prueba')),
  fecha_ref       date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rrhh_alerta_log_uq
  ON public.rrhh_alerta_log (trabajador_id, tipo, fecha_ref);

CREATE INDEX IF NOT EXISTS rrhh_alerta_log_contrato_idx
  ON public.rrhh_alerta_log (contrato_id, tipo);

ALTER TABLE public.rrhh_alerta_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rrhh_alerta_log'
      AND policyname = 'rrhh_alerta_log_service'
  ) THEN
    CREATE POLICY rrhh_alerta_log_service
      ON public.rrhh_alerta_log FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
