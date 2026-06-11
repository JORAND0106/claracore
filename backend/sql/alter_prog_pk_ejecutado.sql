-- Agregados de ejecución SICOE (nivel 1 aprobado) por PK para mapa programación de obra.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.prog_pk_ejecutado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  presupuesto_directo numeric(16, 2) NOT NULL DEFAULT 0,
  ejecutado numeric(16, 2) NOT NULL DEFAULT 0,
  ejecutado_pct numeric(6, 1) NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_pk_ejecutado_contrato_pk UNIQUE (contrato_id, pk_id)
);

CREATE INDEX IF NOT EXISTS idx_prog_pk_ejecutado_contrato
  ON public.prog_pk_ejecutado (contrato_id);

COMMENT ON TABLE public.prog_pk_ejecutado IS
  'Ejecutado real por PK (SICOE N1 aprobado vs presupuesto directo vigente). Refresco por lote; lectura rápida en /mapa.';
