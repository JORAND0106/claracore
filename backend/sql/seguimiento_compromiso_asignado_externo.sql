-- Espejo de migrations/20260727220000_seguimiento_compromiso_asignado_externo.sql
ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS asignado_externo_id bigint
    REFERENCES public.seguimiento_contacto_externo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_item_asignado_externo
  ON public.seguimiento_item (asignado_externo_id)
  WHERE asignado_externo_id IS NOT NULL;

ALTER TABLE public.seguimiento_item
  DROP CONSTRAINT IF EXISTS seguimiento_item_compromiso_req;

ALTER TABLE public.seguimiento_item
  ADD CONSTRAINT seguimiento_item_compromiso_req CHECK (
    origen <> 'compromiso'
    OR (
      contrato_id IS NOT NULL
      AND acta_id IS NOT NULL
      AND solicitante_id IS NOT NULL
      AND fecha_vencimiento IS NOT NULL
      AND (
        asignado_a_id IS NOT NULL
        OR asignado_externo_id IS NOT NULL
      )
    )
  );
