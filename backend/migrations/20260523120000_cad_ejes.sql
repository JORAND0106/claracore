-- ClaraCore — Ejes CAD (SicoeCAD Fase 2)
-- Tabla: cad_ejes — metadatos + AxisContext serializado por contrato
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS public.cad_ejes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  axis_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cad_ejes_nombre CHECK (length(trim(nombre)) > 0)
);

COMMENT ON TABLE public.cad_ejes IS
  'Ejes de abscisado definidos desde SicoeCAD (AutoCAD) por contrato.';

CREATE INDEX IF NOT EXISTS idx_cad_ejes_contrato
  ON public.cad_ejes (contrato_id, created_at DESC);
