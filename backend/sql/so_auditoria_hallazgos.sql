-- Ambiente de Auditoría SicoeObra: persistencia de hallazgos del contrato.
-- Depende de so_auditoria_traslapos.sql (tolerancia / sector).
-- Estados: pendiente | justificado | corregido.
-- Fingerprint estable = mismo motor que alertas al asignar ítem.

CREATE TABLE IF NOT EXISTS public.so_auditoria_hallazgos (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'traslapo',
    'vacio',
    'no_auditable',
    'ubicacion_inconsistente',
    'costado_inconsistente'
  )),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'justificado', 'corregido')),
  item_numero text,
  tramo text,
  infraestructura text,
  costado text,
  ubicacion text,
  medida_m numeric(14, 4),
  abs_desde numeric(14, 4),
  abs_hasta numeric(14, 4),
  pk_id_id text,
  valor_en_juego numeric(18, 2) NOT NULL DEFAULT 0,
  registros_involucrados jsonb NOT NULL DEFAULT '[]'::jsonb,
  texto text,
  justificacion text,
  justificado_por bigint,
  justificado_por_nombre text,
  justificado_en timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_so_auditoria_hallazgos_contrato_fp UNIQUE (contrato_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_so_auditoria_hallazgos_contrato_estado
  ON public.so_auditoria_hallazgos (contrato_id, estado);

CREATE INDEX IF NOT EXISTS idx_so_auditoria_hallazgos_contrato_tipo
  ON public.so_auditoria_hallazgos (contrato_id, tipo);

CREATE INDEX IF NOT EXISTS idx_so_auditoria_hallazgos_contrato_item
  ON public.so_auditoria_hallazgos (contrato_id, item_numero);

COMMENT ON TABLE public.so_auditoria_hallazgos IS
  'Hallazgos de auditoría (traslapos/vacíos/no auditables) del contrato. Exclusivo roles contratista.';

COMMENT ON COLUMN public.so_auditoria_hallazgos.fingerprint IS
  'Huella estable del hallazgo (tipo + registros + abscisas/PK). Al desaparecer del análisis → estado corregido.';

COMMENT ON COLUMN public.so_auditoria_hallazgos.estado IS
  'pendiente | justificado | corregido. Corregido automático cuando el hallazgo deja de existir en el análisis.';
