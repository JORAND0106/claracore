-- ClaraCore — Almacén: insumos, proveedores y refinamiento solicitudes
-- Ejecutar en Supabase SQL Editor después de almacen_modulo.sql. Idempotente.

-- ── Catálogo de insumos del contrato (listado de precios + creados en almacén) ──
CREATE TABLE IF NOT EXISTS public.almacen_insumo (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  listado_precio_id     integer REFERENCES public.listado_precios(id) ON DELETE SET NULL,
  codigo                text NOT NULL,
  descripcion           text NOT NULL,
  unidad                text NOT NULL DEFAULT 'UND',
  valor_compra_referencia numeric(18, 2) NOT NULL DEFAULT 0,
  capitulo              text,
  item_numero           text,
  activo                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT almacen_insumo_uq UNIQUE (contrato_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_contrato
  ON public.almacen_insumo (contrato_id);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_listado
  ON public.almacen_insumo (listado_precio_id)
  WHERE listado_precio_id IS NOT NULL;

-- ── Proveedores del contrato ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_proveedor (
  id              bigserial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  razon_social    text NOT NULL,
  nit             text NOT NULL,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT almacen_proveedor_nit_uq UNIQUE (contrato_id, nit)
);

CREATE INDEX IF NOT EXISTS idx_almacen_proveedor_contrato
  ON public.almacen_proveedor (contrato_id);

-- ── Precio de venta por insumo + proveedor (histórico) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.almacen_insumo_proveedor_precio (
  id              bigserial PRIMARY KEY,
  insumo_id       bigint NOT NULL REFERENCES public.almacen_insumo(id) ON DELETE CASCADE,
  proveedor_id    bigint NOT NULL REFERENCES public.almacen_proveedor(id) ON DELETE CASCADE,
  precio_venta    numeric(18, 2) NOT NULL CHECK (precio_venta >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_prov_precio
  ON public.almacen_insumo_proveedor_precio (insumo_id, proveedor_id, created_at DESC);

-- ── Ampliar ítems de solicitud ─────────────────────────────────────────────────
ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS insumo_id bigint REFERENCES public.almacen_insumo(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS listado_precio_id integer REFERENCES public.listado_precios(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS valor_compra_unitario numeric(18, 2);

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS vlr_unitario_cobro numeric(18, 2);

ALTER TABLE public.almacen_solicitud_item
  ADD COLUMN IF NOT EXISTS supera_presupuesto boolean NOT NULL DEFAULT false;

-- ── Ampliar cotizaciones ───────────────────────────────────────────────────────
ALTER TABLE public.almacen_cotizacion
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
