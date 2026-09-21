-- ClaraCore — RRHH: aplicar YA en Supabase (SQL Editor)
-- Causa raíz del 500/400 al guardar edición de colaborador (2026-09-21):
--   PostgREST PGRST204 / 42703 — faltan columnas que el PUT siempre envía:
--     contrato_requiere_renovacion, contrato_periodicidad_renovacion,
--     alerta_vencimiento_*, alerta_periodo_prueba_enviada_at, dedicacion
-- periodo_prueba_dias ya existe en producción; ADD IF NOT EXISTS es seguro.
-- Idempotente. Tras ejecutar: NOTIFY pgrst para refrescar schema cache.

ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS contrato_requiere_renovacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_periodicidad_renovacion text,
  ADD COLUMN IF NOT EXISTS periodo_prueba_dias integer,
  ADD COLUMN IF NOT EXISTS alerta_vencimiento_35_enviada_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerta_vencimiento_10_enviada_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerta_periodo_prueba_enviada_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedicacion text NOT NULL DEFAULT 'tiempo_completo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rrhh_trabajadores_periodicidad_renovacion_check'
  ) THEN
    ALTER TABLE public.rrhh_trabajadores
      ADD CONSTRAINT rrhh_trabajadores_periodicidad_renovacion_check
      CHECK (
        contrato_periodicidad_renovacion IS NULL
        OR contrato_periodicidad_renovacion IN (
          'mensual', 'bimestral', 'trimestral', 'semestral', 'anual'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rrhh_trabajadores_periodo_prueba_dias_check'
  ) THEN
    ALTER TABLE public.rrhh_trabajadores
      ADD CONSTRAINT rrhh_trabajadores_periodo_prueba_dias_check
      CHECK (periodo_prueba_dias IS NULL OR periodo_prueba_dias BETWEEN 1 AND 365);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rrhh_trabajadores_dedicacion_check'
  ) THEN
    ALTER TABLE public.rrhh_trabajadores
      ADD CONSTRAINT rrhh_trabajadores_dedicacion_check
      CHECK (dedicacion IN ('tiempo_completo', 'parcial'));
  END IF;
END $$;

COMMENT ON COLUMN public.rrhh_trabajadores.contrato_requiere_renovacion IS
  'Indica si el contrato laboral requiere renovación periódica.';
COMMENT ON COLUMN public.rrhh_trabajadores.contrato_periodicidad_renovacion IS
  'Periodicidad de renovación: mensual | bimestral | trimestral | semestral | anual.';
COMMENT ON COLUMN public.rrhh_trabajadores.periodo_prueba_dias IS
  'Duración del período de prueba en días desde fecha_ingreso.';
COMMENT ON COLUMN public.rrhh_trabajadores.alerta_vencimiento_35_enviada_at IS
  'Timestamp de la alerta de vencimiento a 35 días (término fijo).';
COMMENT ON COLUMN public.rrhh_trabajadores.alerta_vencimiento_10_enviada_at IS
  'Timestamp de la alerta de vencimiento a 10 días (sin renovación/otrosí).';
COMMENT ON COLUMN public.rrhh_trabajadores.alerta_periodo_prueba_enviada_at IS
  'Timestamp de la alerta de período de prueba (5 días antes).';
COMMENT ON COLUMN public.rrhh_trabajadores.dedicacion IS
  'Dedicación: tiempo_completo | parcial. Parcial + Prestación de servicios exceptúa piso SMMLV.';

ALTER TABLE public.rrhh_contratos_generados
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'generado';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rrhh_contratos_generados_origen_check'
  ) THEN
    ALTER TABLE public.rrhh_contratos_generados
      ADD CONSTRAINT rrhh_contratos_generados_origen_check
      CHECK (origen IN ('generado', 'cargado'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
