-- Programacion de Obra — dependencias a nivel capitulo o agrupador WBS
-- REVISAR antes de ejecutar en Supabase.
--
-- Reglas de negocio:
--   agrupador_id_origen / agrupador_id_destino NULL  -> dependencia entre capitulos completos
--   agrupador_id presente en un lado                  -> nodo CPM agrupador en ese lado
--   (capitulo siempre requerido en ambos lados)
--
-- Prerequisito: listado_precios_agrupadores.id es BIGSERIAL (bigint)

ALTER TABLE public.prog_dependencias
  ADD COLUMN IF NOT EXISTS agrupador_id_origen BIGINT
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agrupador_id_destino BIGINT
    REFERENCES public.listado_precios_agrupadores(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.prog_dependencias.agrupador_id_origen IS
  'Opcional. Si NULL, el origen es el capitulo completo; si presente, el nodo CPM es el agrupador WBS.';
COMMENT ON COLUMN public.prog_dependencias.agrupador_id_destino IS
  'Opcional. Si NULL, el destino es el capitulo completo; si presente, el nodo CPM es el agrupador WBS.';

-- Indice unico: ver fix_prog_dependencias_unique_index.sql (incluye agrupadores + tipo)

CREATE INDEX IF NOT EXISTS prog_dependencias_agrupador_origen_idx
  ON public.prog_dependencias (agrupador_id_origen)
  WHERE agrupador_id_origen IS NOT NULL;

CREATE INDEX IF NOT EXISTS prog_dependencias_agrupador_destino_idx
  ON public.prog_dependencias (agrupador_id_destino)
  WHERE agrupador_id_destino IS NOT NULL;
