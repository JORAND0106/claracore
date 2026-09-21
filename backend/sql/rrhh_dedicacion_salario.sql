-- ClaraCore — RRHH: dedicación laboral (tiempo completo / parcial)
-- Usado para excepción de SMMLV en Prestación de servicios parcial.
-- Idempotente.

ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS dedicacion text NOT NULL DEFAULT 'tiempo_completo';

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

COMMENT ON COLUMN public.rrhh_trabajadores.dedicacion IS
  'Dedicación: tiempo_completo | parcial. Parcial + Prestación de servicios exceptúa piso SMMLV.';
