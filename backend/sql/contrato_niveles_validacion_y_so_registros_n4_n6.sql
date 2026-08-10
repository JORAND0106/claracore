-- Validación SICOE hasta 6 niveles: columnas en so_registros y configuración por contrato.
-- Ejecutar en Supabase SQL Editor antes de usar los endpoints extendidos.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS nivel4_estado text,
  ADD COLUMN IF NOT EXISTS nivel4_usuario_id bigint REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nivel4_fecha timestamptz,
  ADD COLUMN IF NOT EXISTS nivel5_estado text,
  ADD COLUMN IF NOT EXISTS nivel5_usuario_id bigint REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nivel5_fecha timestamptz,
  ADD COLUMN IF NOT EXISTS nivel6_estado text,
  ADD COLUMN IF NOT EXISTS nivel6_usuario_id bigint REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nivel6_fecha timestamptz;

CREATE TABLE IF NOT EXISTS public.contrato_niveles_validacion (
  contrato_id bigint PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  niveles_activos integer[] NOT NULL DEFAULT ARRAY[1, 2, 3]::integer[]
);

COMMENT ON TABLE public.contrato_niveles_validacion IS
  'Niveles de validación SICOE activos por contrato (valores 1–6). Por defecto [1,2,3] si no hay fila. '
  'Ver también roles_por_nivel en contrato_niveles_validacion_roles_por_nivel.sql.';
