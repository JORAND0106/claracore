-- Bitácora: catálogo reutilizable de colaboradores + asistencia diaria en el Diario.

CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_colaborador (
  id                      bigserial PRIMARY KEY,
  contrato_id             integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre                  text NOT NULL,
  nombre_norm             text NOT NULL,
  documento_tipo          text NOT NULL DEFAULT 'CC',
  documento_numero        text NOT NULL DEFAULT '',
  documento_norm          text NOT NULL DEFAULT '',
  cargo                   text NOT NULL DEFAULT '',
  subcontratista_id       integer,
  subcontratista_nombre   text NOT NULL DEFAULT '',
  activo                  boolean NOT NULL DEFAULT true,
  created_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_bitacora_colaborador IS
  'Colaboradores de obra (asistencia Bitácora Diario), reutilizables por contrato.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_colaborador_contrato_nombre
  ON public.seguimiento_bitacora_colaborador (contrato_id, nombre_norm)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_colaborador_contrato_activo
  ON public.seguimiento_bitacora_colaborador (contrato_id)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_colaborador_documento
  ON public.seguimiento_bitacora_colaborador (contrato_id, documento_norm)
  WHERE activo = true AND documento_norm <> '';

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS asistencia_colaboradores jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.asistencia_colaboradores IS
  'Snapshot de asistencia diaria por colaborador (Reporte Diario). personal se deriva agregando cargos Activo.';

NOTIFY pgrst, 'reload schema';
