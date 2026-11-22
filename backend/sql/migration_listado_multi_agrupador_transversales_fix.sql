-- Membership N:N ítem↔agrupador + transversales + trigger coherente.
-- Corrige agrupadores creados vacíos cuando faltaba listado_precios_agrupador_items.
-- Idempotente. Incluye NOTIFY PostgREST.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Membership N:N
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
  'Membership N:N ítem↔agrupador. Un ítem puede estar en varios AG (capítulo o transversales).';

-- Backfill desde FK legacy
INSERT INTO public.listado_precios_agrupador_items (agrupador_id, item_id)
SELECT lp.agrupador_id, lp.id
FROM public.listado_precios lp
WHERE lp.agrupador_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Flag transversal
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listado_precios_agrupadores
  ADD COLUMN IF NOT EXISTS es_transversal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listado_precios_agrupadores.es_transversal IS
  'true = agrupador transversal (ítems de varios capítulos; codigo_wbs T.A…). '
  'capitulo se guarda como ''Transversales''.';

CREATE INDEX IF NOT EXISTS idx_lp_agrupadores_transversal
  ON public.listado_precios_agrupadores (contrato_id, es_transversal)
  WHERE es_transversal = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Trigger: permitir AG transversal (cualquier capítulo del mismo contrato)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_listado_precios_agrupador_coherente()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ag RECORD;
BEGIN
  IF NEW.agrupador_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT contrato_id, capitulo, COALESCE(es_transversal, false) AS es_transversal
  INTO ag
  FROM public.listado_precios_agrupadores
  WHERE id = NEW.agrupador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agrupador % no existe', NEW.agrupador_id;
  END IF;

  IF ag.contrato_id IS DISTINCT FROM NEW.contrato_id THEN
    RAISE EXCEPTION 'El agrupador pertenece a otro contrato';
  END IF;

  -- Transversales: no exigen mismo capítulo (membership N:N es la fuente de verdad).
  IF ag.es_transversal
     OR trim(coalesce(ag.capitulo, '')) = 'Transversales' THEN
    RETURN NEW;
  END IF;

  IF trim(coalesce(ag.capitulo, '')) IS DISTINCT FROM trim(coalesce(NEW.capitulo, '')) THEN
    RAISE EXCEPTION 'El agrupador no pertenece al capítulo del ítem';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listado_precios_agrupador_coherente ON public.listado_precios;

CREATE TRIGGER listado_precios_agrupador_coherente
  BEFORE INSERT OR UPDATE OF agrupador_id, contrato_id, capitulo
  ON public.listado_precios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_listado_precios_agrupador_coherente();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Líneas de presupuesto → agrupador (si aún no existe)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RLS
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

NOTIFY pgrst, 'reload schema';
