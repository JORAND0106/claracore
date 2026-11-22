-- Agrupadores transversales (ítems de varios capítulos).
-- Códigos propios T.A, T.B, … fuera de los capítulos.
-- Requiere migration_multi_agrupador_lineas.sql (membership N:N).
-- Idempotente. Ejecutar en Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Flag es_transversal en listado_precios_agrupadores
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listado_precios_agrupadores
  ADD COLUMN IF NOT EXISTS es_transversal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listado_precios_agrupadores.es_transversal IS
  'true = agrupador transversal (ítems de varios capítulos; codigo_wbs T.A, T.B…). '
  'capitulo se guarda como ''Transversales''.';

CREATE INDEX IF NOT EXISTS idx_lp_agrupadores_transversal
  ON public.listado_precios_agrupadores (contrato_id, es_transversal)
  WHERE es_transversal = true;

-- Sentinel de capítulo para transversales (vista WBS / programación)
COMMENT ON COLUMN public.listado_precios_agrupadores.capitulo IS
  'Capítulo del agrupador, o ''Transversales'' si es_transversal.';

-- Actualizar comentario del membership: ya no exige mismo capítulo si el AG es transversal
COMMENT ON TABLE public.listado_precios_agrupador_items IS
  'Membership N:N ítem↔agrupador. Un ítem puede estar en varios AG (de capítulo o transversales).';
