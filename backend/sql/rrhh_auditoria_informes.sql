-- ClaraCore — RRHH: historial de informes de auditoría documental
-- Idempotente. Cada ejecución queda registrada (fecha + usuario + filas tabla).

CREATE TABLE IF NOT EXISTS public.rrhh_auditoria_informes (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  trabajador_id         bigint NOT NULL REFERENCES public.rrhh_trabajadores(id) ON DELETE CASCADE,
  filas                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultado_ia          jsonb NOT NULL DEFAULT '{}'::jsonb,
  tiene_discrepancias   boolean NOT NULL DEFAULT false,
  documentos_auditados  integer NOT NULL DEFAULT 0,
  observaciones         text,
  tokens_in             integer,
  tokens_out            integer,
  ejecutado_en          timestamptz NOT NULL DEFAULT now(),
  ejecutado_por         integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS rrhh_auditoria_informes_trab_idx
  ON public.rrhh_auditoria_informes (trabajador_id, ejecutado_en DESC);

CREATE INDEX IF NOT EXISTS rrhh_auditoria_informes_contrato_idx
  ON public.rrhh_auditoria_informes (contrato_id, ejecutado_en DESC);

COMMENT ON TABLE public.rrhh_auditoria_informes IS
  'Historial de informes de auditoría documental RRHH (tabla Ubicación/Archivo/Versión/Hallazgo).';

-- Flag explícito: hubo al menos una auditoría (además de doc_auditoria_en).
ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS doc_auditoria_informe_id bigint
    REFERENCES public.rrhh_auditoria_informes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rrhh_trabajadores.doc_auditoria_informe_id IS
  'Último informe de auditoría registrado (rrhh_auditoria_informes.id).';

NOTIFY pgrst, 'reload schema';
