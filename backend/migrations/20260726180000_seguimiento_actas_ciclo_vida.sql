-- Ciclo de vida de actas (Borrador / Realizada / Firmada), tipo Interna|Externa,
-- estado Reprogramar en ítems y base de nivel tras reprogramación.

-- ── Acta: tipo ───────────────────────────────────────────────────────────────
ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS tipo_acta text;

UPDATE public.seguimiento_acta
SET tipo_acta = 'interna'
WHERE tipo_acta IS NULL;

ALTER TABLE public.seguimiento_acta
  ALTER COLUMN tipo_acta SET DEFAULT 'interna';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seguimiento_acta_tipo_check'
  ) THEN
    ALTER TABLE public.seguimiento_acta
      ADD CONSTRAINT seguimiento_acta_tipo_check
      CHECK (tipo_acta IS NULL OR tipo_acta IN ('interna', 'externa'));
  END IF;
END $$;

-- ── Acta: estados del ciclo de vida ──────────────────────────────────────────
-- Mapear estados legacy → nuevos
UPDATE public.seguimiento_acta
SET estado = 'realizada'
WHERE estado IN ('en_firma', 'cerrada');

ALTER TABLE public.seguimiento_acta DROP CONSTRAINT IF EXISTS seguimiento_acta_estado_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seguimiento_acta_estado_ciclo_check'
  ) THEN
    ALTER TABLE public.seguimiento_acta
      ADD CONSTRAINT seguimiento_acta_estado_ciclo_check
      CHECK (estado IN ('borrador', 'realizada', 'firmada'));
  END IF;
END $$;

COMMENT ON COLUMN public.seguimiento_acta.tipo_acta IS
  'Clasificación de la reunión: interna o externa.';
COMMENT ON COLUMN public.seguimiento_acta.estado IS
  'Ciclo de vida: borrador → realizada → firmada.';

-- ── Ítems: reprogramar + fecha base de nivel ─────────────────────────────────
ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS fecha_base_nivel date;

ALTER TABLE public.seguimiento_item DROP CONSTRAINT IF EXISTS seguimiento_item_estado_gestion_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seguimiento_item_estado_gestion_v2_check'
  ) THEN
    ALTER TABLE public.seguimiento_item
      ADD CONSTRAINT seguimiento_item_estado_gestion_v2_check
      CHECK (estado_gestion IN (
        'abierto', 'en_progreso', 'cumplido', 'parcial',
        'vencido', 'cancelado', 'reprogramado'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.seguimiento_item.fecha_base_nivel IS
  'Fecha desde la cual se calcula el nivel de vencimiento (se reinicia al reprogramar).';

NOTIFY pgrst, 'reload schema';
