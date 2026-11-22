-- Multi-agrupador (N:N listado) + asignación de líneas de presupuesto por versión de programación.
-- Sustituye el modelo de segregación por partes (prog_partes) a nivel de producto.
-- Idempotente. Ejecutar en Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Membership N:N ítem ↔ agrupadores (Listado de Precios)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.listado_precios_agrupador_items (
  agrupador_id BIGINT NOT NULL
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL
    REFERENCES public.listado_precios(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agrupador_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_lp_ag_items_item
  ON public.listado_precios_agrupador_items (item_id);

CREATE INDEX IF NOT EXISTS idx_lp_ag_items_agrupador
  ON public.listado_precios_agrupador_items (agrupador_id);

COMMENT ON TABLE public.listado_precios_agrupador_items IS
  'Membership N:N: un ítem del listado puede pertenecer a varios agrupadores WBS del mismo capítulo.';

-- Backfill desde la FK legacy listado_precios.agrupador_id
INSERT INTO public.listado_precios_agrupador_items (agrupador_id, item_id)
SELECT lp.agrupador_id, lp.id
FROM public.listado_precios lp
WHERE lp.agrupador_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Asignación línea de presupuesto → agrupador (por versión de programación)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.prog_linea_agrupador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL
    REFERENCES public.prog_versiones(id) ON DELETE CASCADE,
  contrato_id BIGINT NOT NULL
    REFERENCES public.contratos(id) ON DELETE CASCADE,
  pk_id VARCHAR(50) NOT NULL,
  capitulo VARCHAR(100) NOT NULL,
  item VARCHAR(100) NOT NULL,
  -- Clave estable de la fila física (presupuesto.id origen o id del snapshot).
  linea_key TEXT NOT NULL,
  presupuesto_item_id BIGINT,
  agrupador_id BIGINT NOT NULL
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE RESTRICT,
  abs_inicio TEXT,
  abs_final TEXT,
  descripcion TEXT,
  unidad TEXT,
  cantidad NUMERIC(18, 4) NOT NULL DEFAULT 0,
  vlr_unitario NUMERIC(18, 4) NOT NULL DEFAULT 0,
  alerta_linea_nueva BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_prog_linea_agrupador_unica
    UNIQUE (version_id, linea_key)
);

CREATE INDEX IF NOT EXISTS idx_prog_linea_ag_version_pk
  ON public.prog_linea_agrupador (version_id, pk_id, capitulo, agrupador_id);

CREATE INDEX IF NOT EXISTS idx_prog_linea_ag_item
  ON public.prog_linea_agrupador (version_id, pk_id, capitulo, item);

CREATE INDEX IF NOT EXISTS idx_prog_linea_ag_agrupador
  ON public.prog_linea_agrupador (agrupador_id);

COMMENT ON TABLE public.prog_linea_agrupador IS
  'Asigna cada línea física del presupuesto (dentro de un PK) a un solo agrupador WBS por versión de programación.';

COMMENT ON COLUMN public.prog_linea_agrupador.linea_key IS
  'Identificador estable: ppto:{presupuesto.id} o snap:{presupuesto_version_items.id}.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RLS básica (alineada a otras tablas prog_*)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listado_precios_agrupador_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prog_linea_agrupador ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY listado_precios_agrupador_items_all
    ON public.listado_precios_agrupador_items FOR ALL
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY prog_linea_agrupador_all
    ON public.prog_linea_agrupador FOR ALL
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
