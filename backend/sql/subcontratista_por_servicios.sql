-- Subcontratistas tipo «por_servicios» (profesionales / topografía):
-- tarifas pactadas mensuales + control de presencia informativo en el corte.
-- Idempotente. No altera el comportamiento de subcontratistas por cantidades.

ALTER TABLE public.subcontratistas
  ADD COLUMN IF NOT EXISTS tipo text;

UPDATE public.subcontratistas
SET tipo = 'por_cantidades'
WHERE tipo IS NULL OR btrim(tipo) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subcontratistas_tipo_check'
  ) THEN
    ALTER TABLE public.subcontratistas
      ADD CONSTRAINT subcontratistas_tipo_check
      CHECK (tipo IN ('por_cantidades', 'por_servicios'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.subcontratistas
  ALTER COLUMN tipo SET DEFAULT 'por_cantidades';

COMMENT ON COLUMN public.subcontratistas.tipo IS
  'por_cantidades (default, SICOE) | por_servicios (tarifas mensuales + presencia Bitácora).';

CREATE TABLE IF NOT EXISTS public.subcontratista_tarifas_servicio (
  id bigserial PRIMARY KEY,
  subcontratista_id integer NOT NULL
    REFERENCES public.subcontratistas(id) ON DELETE CASCADE,
  contrato_id integer NOT NULL,
  concepto text NOT NULL,
  tarifa_mensual numeric(18, 2) NOT NULL DEFAULT 0,
  cantidad_profesionales numeric(18, 4) NOT NULL DEFAULT 1,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_tarifas_servicio_sub
  ON public.subcontratista_tarifas_servicio (subcontratista_id, orden, id);

CREATE INDEX IF NOT EXISTS idx_sub_tarifas_servicio_contrato
  ON public.subcontratista_tarifas_servicio (contrato_id, subcontratista_id);

COMMENT ON TABLE public.subcontratista_tarifas_servicio IS
  'Tarifas pactadas mensuales para subcontratistas por_servicios (concepto × tarifa × cant. profesionales).';

-- Otros conceptos: permitir costo_total negativo (descuentos manuales en conciliación).
COMMENT ON TABLE public.corte_sub_otros_conceptos IS
  'Otros conceptos del corte (sin AIU/IVA). costo_total = cantidad × valor_unitario (puede ser negativo para descuentos).';

NOTIFY pgrst, 'reload schema';
