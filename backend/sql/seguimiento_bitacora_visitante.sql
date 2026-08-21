-- Bitácora: catálogo reutilizable de visitantes por contrato (Reporte de Evento).
-- Mirror de migrations/20260821210000_seguimiento_bitacora_visitante.sql

CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_visitante (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  nombre_norm   text NOT NULL,
  cargo         text NOT NULL DEFAULT '',
  activo        boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_bitacora_visitante IS
  'Visitantes externos de Bitácora (Reporte de Evento), reutilizables por contrato vía autocompletado.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_visitante_contrato_nombre
  ON public.seguimiento_bitacora_visitante (contrato_id, nombre_norm)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_visitante_contrato_activo
  ON public.seguimiento_bitacora_visitante (contrato_id)
  WHERE activo = true;

NOTIFY pgrst, 'reload schema';
