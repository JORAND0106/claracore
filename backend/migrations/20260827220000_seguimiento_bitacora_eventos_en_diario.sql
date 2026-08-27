-- Unificación Bitácora: eventos como bloques dentro del Reporte Diario.
-- Ventana de gracia D+1 se aplica en código (momento_cierre_diario).

ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS eventos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.eventos IS
  'Bloques de evento del Reporte Diario (tipo, texto, actividades, visitantes, adjuntos). Solo aplica a tipo=diario.';

-- Marca eventos legacy ya consolidados dentro de un diario (ocultos del hilo independiente).
ALTER TABLE public.seguimiento_bitacora_entrada
  ADD COLUMN IF NOT EXISTS consolidado_en_diario_id bigint
    REFERENCES public.seguimiento_bitacora_entrada(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_entrada_consolidado
  ON public.seguimiento_bitacora_entrada (contrato_id, consolidado_en_diario_id)
  WHERE consolidado_en_diario_id IS NOT NULL;

COMMENT ON COLUMN public.seguimiento_bitacora_entrada.consolidado_en_diario_id IS
  'Si está set, este Reporte de Evento legacy ya fue migrado como bloque del diario indicado.';

NOTIFY pgrst, 'reload schema';
