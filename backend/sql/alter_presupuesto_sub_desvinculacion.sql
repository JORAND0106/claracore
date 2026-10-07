-- Mirror of migrations/20261007220000_presupuesto_sub_desvinculacion.sql
CREATE TABLE IF NOT EXISTS public.presupuesto_sub_desvinculacion (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  subcontratista_id integer NOT NULL REFERENCES public.subcontratistas(id) ON DELETE CASCADE,
  usuario_id integer,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppto_sub_desvinc_contrato
  ON public.presupuesto_sub_desvinculacion (contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ppto_sub_desvinc_sub
  ON public.presupuesto_sub_desvinculacion (subcontratista_id, created_at DESC);
