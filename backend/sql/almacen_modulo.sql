-- ClaraCore — Módulo de Almacén de Obra (Fase 1)
-- Cimientos + Solicitudes → Cotizaciones → OC → Entradas → Inventario
-- Ejecutar manualmente en Supabase SQL Editor. Idempotente.
--
-- Dependencias: contratos, presupuesto, usuarios, funciones, permisos

-- ── Función para Control de accesos ─────────────────────────────────────────
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'ALMACEN', 'Almacén', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'almacén'
     OR lower(trim(f.nombre)) = 'almacen'
     OR upper(trim(f.codigo::text)) = 'ALMACEN'
);

-- ── Configuración por contrato ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_config (
  contrato_id               integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  cotizaciones_minimas      integer NOT NULL DEFAULT 3
                            CHECK (cotizaciones_minimas >= 1 AND cotizaciones_minimas <= 10),
  dias_alerta_vencimiento   integer NOT NULL DEFAULT 30
                            CHECK (dias_alerta_vencimiento >= 1 AND dias_alerta_vencimiento <= 365),
  updated_at                timestamptz,
  updated_by                integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.almacen_config IS
  'Parámetros del módulo Almacén por contrato (cotizaciones mínimas, alertas de vencimiento).';

-- ── Solicitudes de materiales ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_solicitud (
  id              bigserial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  consecutivo     integer NOT NULL,
  estado          text NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada')),
  observaciones   text,
  motivo_rechazo  text,
  created_by      integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  enviada_at      timestamptz,
  validada_at     timestamptz,
  validada_by     integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT almacen_solicitud_consecutivo_uq UNIQUE (contrato_id, consecutivo)
);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_contrato_estado
  ON public.almacen_solicitud (contrato_id, estado);

COMMENT ON TABLE public.almacen_solicitud IS
  'Solicitudes de materiales asociadas a ítems de presupuesto del contrato.';

-- ── Ítems de solicitud ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_solicitud_item (
  id                        bigserial PRIMARY KEY,
  solicitud_id              bigint NOT NULL REFERENCES public.almacen_solicitud(id) ON DELETE CASCADE,
  presupuesto_id            integer NOT NULL REFERENCES public.presupuesto(id),
  pk_id                     text,
  capitulo                  text,
  item                      text,
  material_descripcion      text NOT NULL,
  unidad                    text NOT NULL,
  cantidad                  numeric(18, 4) NOT NULL CHECK (cantidad > 0),
  es_recurrente             boolean NOT NULL DEFAULT false,
  cant_presupuestada        numeric(18, 4),
  cotizacion_seleccionada_id bigint
);

CREATE INDEX IF NOT EXISTS idx_almacen_solicitud_item_solicitud
  ON public.almacen_solicitud_item (solicitud_id);

-- ── Cotizaciones comparativas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_cotizacion (
  id                  bigserial PRIMARY KEY,
  solicitud_item_id   bigint NOT NULL REFERENCES public.almacen_solicitud_item(id) ON DELETE CASCADE,
  proveedor_nombre    text NOT NULL,
  valor_unitario      numeric(18, 2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total         numeric(18, 2),
  observaciones       text,
  archivo_blob_path   text,
  archivo_nombre      text,
  created_by          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_almacen_cotizacion_item
  ON public.almacen_cotizacion (solicitud_item_id);

-- FK diferida: cotización seleccionada al aprobar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'almacen_solicitud_item_cotizacion_sel_fk'
  ) THEN
    ALTER TABLE public.almacen_solicitud_item
      ADD CONSTRAINT almacen_solicitud_item_cotizacion_sel_fk
      FOREIGN KEY (cotizacion_seleccionada_id)
      REFERENCES public.almacen_cotizacion(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Órdenes de compra (generadas al aprobar solicitud) ───────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_orden_compra (
  id                  bigserial PRIMARY KEY,
  solicitud_id        bigint NOT NULL UNIQUE REFERENCES public.almacen_solicitud(id),
  contrato_id         integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_oc           integer NOT NULL,
  estado              text NOT NULL DEFAULT 'aprobada'
                      CHECK (estado IN ('aprobada', 'parcial', 'completa', 'anulada')),
  fecha_compromiso    date,
  factura_blob_path   text,
  factura_nombre      text,
  factura_mime        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  aprobada_por        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT almacen_orden_compra_numero_uq UNIQUE (contrato_id, numero_oc)
);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_contrato
  ON public.almacen_orden_compra (contrato_id);

-- ── Líneas de orden de compra ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_orden_compra_item (
  id                    bigserial PRIMARY KEY,
  orden_compra_id       bigint NOT NULL REFERENCES public.almacen_orden_compra(id) ON DELETE CASCADE,
  solicitud_item_id     bigint NOT NULL REFERENCES public.almacen_solicitud_item(id),
  cotizacion_id         bigint REFERENCES public.almacen_cotizacion(id) ON DELETE SET NULL,
  proveedor_nombre      text NOT NULL,
  material_descripcion  text NOT NULL,
  unidad                text NOT NULL,
  cantidad              numeric(18, 4) NOT NULL CHECK (cantidad > 0),
  valor_unitario        numeric(18, 2) NOT NULL CHECK (valor_unitario >= 0),
  presupuesto_id        integer NOT NULL REFERENCES public.presupuesto(id),
  cantidad_recibida     numeric(18, 4) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0)
);

CREATE INDEX IF NOT EXISTS idx_almacen_oc_item_oc
  ON public.almacen_orden_compra_item (orden_compra_id);

-- ── Entradas de material ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_entrada (
  id                  bigserial PRIMARY KEY,
  orden_compra_id     bigint NOT NULL REFERENCES public.almacen_orden_compra(id),
  contrato_id         integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  fecha_entrada       date NOT NULL DEFAULT CURRENT_DATE,
  remision_blob_path  text,
  remision_nombre     text,
  remision_mime       text,
  observaciones       text,
  created_by          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_oc
  ON public.almacen_entrada (orden_compra_id);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_contrato
  ON public.almacen_entrada (contrato_id);

-- ── Líneas de entrada ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_entrada_item (
  id                      bigserial PRIMARY KEY,
  entrada_id              bigint NOT NULL REFERENCES public.almacen_entrada(id) ON DELETE CASCADE,
  orden_compra_item_id    bigint NOT NULL REFERENCES public.almacen_orden_compra_item(id),
  presupuesto_id          integer NOT NULL REFERENCES public.presupuesto(id),
  cantidad_recibida       numeric(18, 4) NOT NULL CHECK (cantidad_recibida > 0),
  lote                    text,
  fecha_vencimiento       date
);

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_item_entrada
  ON public.almacen_entrada_item (entrada_id);

-- ── Movimientos de inventario (historial; extensible a salidas/devoluciones) ───
CREATE TABLE IF NOT EXISTS public.almacen_movimiento (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  presupuesto_id        integer NOT NULL REFERENCES public.presupuesto(id),
  material_descripcion  text NOT NULL,
  unidad                text NOT NULL,
  tipo                  text NOT NULL CHECK (tipo IN ('entrada', 'salida', 'devolucion')),
  cantidad              numeric(18, 4) NOT NULL,
  entrada_item_id       bigint REFERENCES public.almacen_entrada_item(id) ON DELETE SET NULL,
  referencia_tipo       text,
  referencia_id         bigint,
  lote                  text,
  fecha_vencimiento     date,
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_almacen_movimiento_contrato
  ON public.almacen_movimiento (contrato_id, presupuesto_id, created_at DESC);

-- ── Stock disponible (actualizado en cada entrada) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_inventario (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  presupuesto_id        integer NOT NULL REFERENCES public.presupuesto(id),
  material_descripcion  text NOT NULL,
  unidad                text NOT NULL,
  stock_disponible      numeric(18, 4) NOT NULL DEFAULT 0,
  cant_presupuestada    numeric(18, 4) NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_inventario_uq UNIQUE (contrato_id, presupuesto_id, material_descripcion)
);

CREATE INDEX IF NOT EXISTS idx_almacen_inventario_contrato
  ON public.almacen_inventario (contrato_id);

NOTIFY pgrst, 'reload schema';
