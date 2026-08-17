-- Devoluciones de material (reingreso desde obra contra una salida).
-- Reactiva saldo disponible = recibido − (salidas − devoluciones).

CREATE TABLE IF NOT EXISTS public.almacen_devolucion (
  id                      bigserial PRIMARY KEY,
  contrato_id             integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_devolucion       integer NOT NULL,
  codigo                  text,
  salida_id               bigint NOT NULL REFERENCES public.almacen_salida(id) ON DELETE RESTRICT,
  entrada_item_id         bigint NOT NULL REFERENCES public.almacen_entrada_item(id) ON DELETE RESTRICT,
  cantidad                numeric(18, 4) NOT NULL CHECK (cantidad > 0),
  fecha_hora_devolucion   timestamptz NOT NULL DEFAULT now(),
  receptor_usuario_id     integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  pk_id                   text,
  pk_id_id                integer,
  tramo                   text,
  costado                 text,
  abscisa_inicial         text,
  abscisa_final           text,
  observaciones           text,
  created_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_devolucion_numero_uq UNIQUE (contrato_id, numero_devolucion)
);

CREATE INDEX IF NOT EXISTS idx_almacen_devolucion_contrato
  ON public.almacen_devolucion (contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacen_devolucion_salida
  ON public.almacen_devolucion (salida_id);

CREATE INDEX IF NOT EXISTS idx_almacen_devolucion_entrada_item
  ON public.almacen_devolucion (entrada_item_id);

CREATE INDEX IF NOT EXISTS idx_almacen_devolucion_pk
  ON public.almacen_devolucion (contrato_id, pk_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_devolucion_codigo_contrato
  ON public.almacen_devolucion (contrato_id, codigo)
  WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

COMMENT ON TABLE public.almacen_devolucion IS
  'Reingreso de material no usado en obra, asociado a una salida (permite parciales).';

NOTIFY pgrst, 'reload schema';
