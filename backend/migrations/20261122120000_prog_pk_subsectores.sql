-- Programación de obra — subdivisión de PK en subsectores por abscisa.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.prog_pk_subsectores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  orden integer NOT NULL DEFAULT 1 CHECK (orden >= 1),
  abs_inicio_m numeric(12,2) NOT NULL,
  abs_final_m numeric(12,2) NOT NULL,
  abs_inicio_label text NOT NULL,
  abs_final_label text NOT NULL,
  geojson jsonb,
  modo_reparto text NOT NULL DEFAULT 'automatico'
    CHECK (modo_reparto IN ('manual', 'automatico', 'mixto')),
  creado_por bigint REFERENCES public.usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_prog_subsector_abs CHECK (abs_final_m > abs_inicio_m),
  CONSTRAINT uq_prog_subsector_rango UNIQUE (version_id, pk_id, abs_inicio_m, abs_final_m)
);

CREATE INDEX IF NOT EXISTS idx_prog_pk_subsectores_version_pk
  ON public.prog_pk_subsectores (version_id, pk_id);

CREATE INDEX IF NOT EXISTS idx_prog_pk_subsectores_contrato
  ON public.prog_pk_subsectores (contrato_id, version_id);

CREATE TABLE IF NOT EXISTS public.prog_pk_subsector_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsector_id uuid NOT NULL REFERENCES public.prog_pk_subsectores(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  item varchar(100) NOT NULL,
  presupuesto_linea_key text,
  cantidad numeric(12,2) NOT NULL CHECK (cantidad >= 0),
  cantidad_total_linea numeric(12,2),
  modo text NOT NULL DEFAULT 'automatico'
    CHECK (modo IN ('manual', 'automatico', 'completa', 'excepcion')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_subsector_linea UNIQUE (subsector_id, capitulo, item, presupuesto_linea_key)
);

CREATE INDEX IF NOT EXISTS idx_prog_subsector_lineas_sub
  ON public.prog_pk_subsector_lineas (subsector_id);

CREATE INDEX IF NOT EXISTS idx_prog_subsector_lineas_pk
  ON public.prog_pk_subsector_lineas (version_id, pk_id);

ALTER TABLE public.prog_actividades
  ADD COLUMN IF NOT EXISTS subsector_id uuid
    REFERENCES public.prog_pk_subsectores(id) ON DELETE SET NULL;

ALTER TABLE public.prog_cpm_resultados
  ADD COLUMN IF NOT EXISTS subsector_id uuid
    REFERENCES public.prog_pk_subsectores(id) ON DELETE SET NULL;

ALTER TABLE public.prog_dependencias
  ADD COLUMN IF NOT EXISTS subsector_id_origen uuid
    REFERENCES public.prog_pk_subsectores(id) ON DELETE CASCADE;

ALTER TABLE public.prog_dependencias
  ADD COLUMN IF NOT EXISTS subsector_id_destino uuid
    REFERENCES public.prog_pk_subsectores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prog_actividades_subsector
  ON public.prog_actividades (subsector_id)
  WHERE subsector_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prog_cpm_subsector
  ON public.prog_cpm_resultados (subsector_id)
  WHERE subsector_id IS NOT NULL;

COMMIT;
