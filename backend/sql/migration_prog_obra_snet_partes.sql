-- Programación de obra — SNET + segregación de agrupadores + presupuesto al sellar
-- Idempotente. Ejecutar en Supabase SQL Editor.

-- 1) Flag de desplazamiento por dependencia (resultado CPM visible)
ALTER TABLE public.prog_actividades
  ADD COLUMN IF NOT EXISTS desplazada_por_dependencia boolean NOT NULL DEFAULT false;

ALTER TABLE public.prog_cpm_resultados
  ADD COLUMN IF NOT EXISTS desplazada_por_dependencia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.prog_actividades.desplazada_por_dependencia IS
  'True si el CPM corrió la fecha de inicio por encima de la restricción manual (SNET).';

-- 2) Versión de presupuesto usada al sellar la programación
ALTER TABLE public.prog_versiones
  ADD COLUMN IF NOT EXISTS version_ppto_sellada_id uuid;

COMMENT ON COLUMN public.prog_versiones.version_ppto_sellada_id IS
  'Versión de presupuesto (Versionador) registrada al sellar esta programación.';

-- 3) Partes segregadas de un agrupador dentro de un PK
CREATE TABLE IF NOT EXISTS public.prog_partes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  agrupador_id bigint NOT NULL,
  nombre text NOT NULL,
  es_pendiente boolean NOT NULL DEFAULT false,
  fecha_inicio date,
  duracion_dias_habiles integer CHECK (duracion_dias_habiles IS NULL OR duracion_dias_habiles > 0),
  override_manual boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  alerta_lineas_nuevas boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_parte_nombre UNIQUE (version_id, pk_id, capitulo, agrupador_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_prog_partes_version_pk
  ON public.prog_partes (version_id, pk_id, capitulo, agrupador_id);

-- 4) Líneas de presupuesto asignadas a cada parte (una sola parte por línea)
CREATE TABLE IF NOT EXISTS public.prog_parte_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parte_id uuid NOT NULL REFERENCES public.prog_partes(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  pk_id varchar(50) NOT NULL,
  capitulo varchar(100) NOT NULL,
  item varchar(100) NOT NULL,
  CONSTRAINT uq_prog_parte_item_unica UNIQUE (version_id, pk_id, capitulo, item)
);

CREATE INDEX IF NOT EXISTS idx_prog_parte_items_parte
  ON public.prog_parte_items (parte_id);

-- 5) Referencia opcional de parte en actividades / CPM / dependencias
ALTER TABLE public.prog_actividades
  ADD COLUMN IF NOT EXISTS parte_id uuid REFERENCES public.prog_partes(id) ON DELETE SET NULL;

ALTER TABLE public.prog_cpm_resultados
  ADD COLUMN IF NOT EXISTS parte_id uuid REFERENCES public.prog_partes(id) ON DELETE SET NULL;

ALTER TABLE public.prog_dependencias
  ADD COLUMN IF NOT EXISTS parte_id_origen uuid REFERENCES public.prog_partes(id) ON DELETE CASCADE;

ALTER TABLE public.prog_dependencias
  ADD COLUMN IF NOT EXISTS parte_id_destino uuid REFERENCES public.prog_partes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prog_actividades_parte
  ON public.prog_actividades (parte_id)
  WHERE parte_id IS NOT NULL;
