-- ClaraCore — Almacén: reparto proporcional de una línea de solicitud
-- entre varios registros de presupuesto (mismo capítulo/ítem/PK-ID).
-- Idempotente. Acceso vía FastAPI (service_role), igual que el resto del módulo.

CREATE TABLE IF NOT EXISTS public.almacen_solicitud_item_reparto (
  id                  bigserial PRIMARY KEY,
  solicitud_item_id   bigint NOT NULL REFERENCES public.almacen_solicitud_item(id) ON DELETE CASCADE,
  presupuesto_id      integer NOT NULL REFERENCES public.presupuesto(id),
  cantidad            numeric(18, 4) NOT NULL CHECK (cantidad > 0),
  CONSTRAINT almacen_solicitud_item_reparto_uq UNIQUE (solicitud_item_id, presupuesto_id)
);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_reparto_item
  ON public.almacen_solicitud_item_reparto (solicitud_item_id);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_reparto_ppto
  ON public.almacen_solicitud_item_reparto (presupuesto_id);

COMMENT ON TABLE public.almacen_solicitud_item_reparto IS
  'Consumo proporcional por registro de presupuesto cuando una línea de solicitud selecciona varios registros.';

NOTIFY pgrst, 'reload schema';
