-- ClaraCore — Catálogo de insumos (panel administrativo)
-- Ejecutar después de almacen_insumo_ubicacion.sql. Idempotente.

-- Campos de cotización ganadora en el insumo
ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS cotizacion_numero text;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS cotizacion_fecha date;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS cotizacion_vigencia text;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.almacen_insumo
  ADD COLUMN IF NOT EXISTS requiere_cotizacion boolean NOT NULL DEFAULT true;

-- Historial de precios (snapshot al actualizar)
CREATE TABLE IF NOT EXISTS public.almacen_insumo_precio_historial (
  id                    bigserial PRIMARY KEY,
  insumo_id             bigint NOT NULL REFERENCES public.almacen_insumo(id) ON DELETE CASCADE,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  proveedor_id          bigint REFERENCES public.almacen_proveedor(id) ON DELETE SET NULL,
  costo_base            numeric(18, 2),
  valor_compra_referencia numeric(18, 2) NOT NULL,
  tipo_impuesto         text,
  impuesto_porcentaje   numeric(8, 4),
  impuestos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  cotizacion_numero     text,
  cotizacion_fecha      date,
  cotizacion_vigencia   text,
  motivo                text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_precio_hist
  ON public.almacen_insumo_precio_historial (insumo_id, created_at DESC);

-- PDFs de cotizaciones de soporte (comparativas)
CREATE TABLE IF NOT EXISTS public.almacen_insumo_cotizacion_soporte (
  id              bigserial PRIMARY KEY,
  insumo_id       bigint NOT NULL REFERENCES public.almacen_insumo(id) ON DELETE CASCADE,
  blob_path       text NOT NULL,
  nombre          text NOT NULL,
  tamano_bytes    integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_almacen_insumo_cot_soporte
  ON public.almacen_insumo_cotizacion_soporte (insumo_id);

-- Función de permisos (panel administrativo)
INSERT INTO public.funciones (codigo, nombre, modulo)
VALUES ('CATINS', 'Catálogo de insumos', 'Obra')
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      modulo = EXCLUDED.modulo;

NOTIFY pgrst, 'reload schema';
