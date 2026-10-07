-- Asignación compartida de cantidades presupuesto ↔ subcontratistas
-- + historial de redistribuciones (soporte otrosí).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.presupuesto_sub_asignacion (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  presupuesto_id integer NOT NULL REFERENCES public.presupuesto(id) ON DELETE CASCADE,
  subcontratista_id integer NOT NULL REFERENCES public.subcontratistas(id) ON DELETE CASCADE,
  cantidad numeric(18, 6) NOT NULL DEFAULT 0
    CHECK (cantidad >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presupuesto_sub_asignacion_unique
    UNIQUE (presupuesto_id, subcontratista_id)
);

CREATE INDEX IF NOT EXISTS idx_ppto_sub_asig_sub
  ON public.presupuesto_sub_asignacion (subcontratista_id, contrato_id);

CREATE INDEX IF NOT EXISTS idx_ppto_sub_asig_contrato_ppto
  ON public.presupuesto_sub_asignacion (contrato_id, presupuesto_id);

COMMENT ON TABLE public.presupuesto_sub_asignacion IS
  'Cantidad actualizada por subcontratista sobre un registro de presupuesto. Permite compartir un mismo registro entre varios subs.';

COMMENT ON COLUMN public.presupuesto_sub_asignacion.cantidad IS
  'Cantidad actualizada del sub en ese registro (ejecutado conciliado + proporción del saldo).';

-- Historial de redistribuciones (quién / cuándo / qué / proporciones / antes-después).
CREATE TABLE IF NOT EXISTS public.presupuesto_sub_redistribucion (
  id bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  usuario_id integer,
  nuevo_subcontratista_id integer REFERENCES public.subcontratistas(id) ON DELETE SET NULL,
  proporciones jsonb NOT NULL DEFAULT '{}'::jsonb,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppto_sub_redis_contrato
  ON public.presupuesto_sub_redistribucion (contrato_id, created_at DESC);

COMMENT ON TABLE public.presupuesto_sub_redistribucion IS
  'Auditoría de redistribuciones de saldo entre subcontratistas sobre registros de presupuesto.';

COMMENT ON COLUMN public.presupuesto_sub_redistribucion.proporciones IS
  'Mapa {subcontratista_id: proporción decimal} aplicadas (deben sumar 1.00).';

COMMENT ON COLUMN public.presupuesto_sub_redistribucion.detalle IS
  'Arreglo por registro: presupuestado, ejecutados, saldo, cantidades antes/después por sub.';

-- Backfill desde asignación exclusiva legado (presupuesto.subcontratista_id).
INSERT INTO public.presupuesto_sub_asignacion (
  contrato_id, presupuesto_id, subcontratista_id, cantidad
)
SELECT
  p.contrato_id,
  p.id,
  p.subcontratista_id,
  COALESCE(p.cant_total, 0)
FROM public.presupuesto p
WHERE p.subcontratista_id IS NOT NULL
  AND COALESCE(p.dado_de_baja, false) = false
  AND COALESCE(p.cant_total, 0) >= 0
ON CONFLICT (presupuesto_id, subcontratista_id) DO NOTHING;
