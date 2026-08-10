-- Mapa rol → nivel de validación SICOE por contrato.
-- Permite flujos distintos al habitual (p. ej. Operativo Interventoría en N1).
-- Idempotente. Ejecutar en Supabase SQL Editor.

ALTER TABLE public.contrato_niveles_validacion
  ADD COLUMN IF NOT EXISTS roles_por_nivel jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contrato_niveles_validacion.roles_por_nivel IS
  'Mapa nivel (claves "1"…"6") → rol_id. Vacío = defaults de plataforma '
  '(N1 Operativo Contratista, N2 Contratista, N3 Contratista Gerencial, '
  'N4 Interventoría, N5 Interventoría Gerencial, N6 Supervisor Externo).';
