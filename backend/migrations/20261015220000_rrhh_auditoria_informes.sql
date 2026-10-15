-- Mirror de backend/sql/rrhh_auditoria_informes.sql
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

ALTER TABLE public.rrhh_trabajadores
  ADD COLUMN IF NOT EXISTS doc_auditoria_informe_id bigint
    REFERENCES public.rrhh_auditoria_informes(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
