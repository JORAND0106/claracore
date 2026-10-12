-- Tipos de acta personalizados por contrato + relajar CHECK interna/externa.

CREATE TABLE IF NOT EXISTS public.seguimiento_acta_tipo_custom (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  nombre_norm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_acta_tipo_custom_uq UNIQUE (contrato_id, nombre_norm)
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_tipo_custom_contrato
  ON public.seguimiento_acta_tipo_custom (contrato_id);

COMMENT ON TABLE public.seguimiento_acta_tipo_custom IS
  'Tipos de acta adicionales (opción Otro) reutilizables por contrato; sin duplicados por nombre_norm.';

-- Permitir tipos personalizados en seguimiento_acta.tipo_acta
ALTER TABLE public.seguimiento_acta
  DROP CONSTRAINT IF EXISTS seguimiento_acta_tipo_check;

ALTER TABLE public.seguimiento_acta
  ADD CONSTRAINT seguimiento_acta_tipo_check
  CHECK (
    tipo_acta IS NULL
    OR length(btrim(tipo_acta)) > 0
  );
