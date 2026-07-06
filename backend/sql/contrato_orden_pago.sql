-- Órdenes de pago / corte de cobro licenciamiento ClaraCore.
-- Ejecutar en Supabase SQL Editor después de contrato_documentos_contractuales.sql
-- Binarios: contenedor Azure privado claracore-privado (ver azure_blob_storage.py).
-- Acceso API: solo cargo Desarrollador.

CREATE TABLE IF NOT EXISTS public.contrato_licencia_cobro_config (
  contrato_id           integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  plan_descripcion      text,
  tipo_periodo          text NOT NULL DEFAULT 'mensual'
                        CHECK (tipo_periodo IN ('mensual', 'quincenal')),
  dia_vencimiento       integer NOT NULL DEFAULT 7 CHECK (dia_vencimiento BETWEEN 1 AND 28),
  logo_receptor         text NOT NULL DEFAULT 'contratista'
                        CHECK (logo_receptor IN ('contratista', 'interventoria', 'ninguno')),
  autorizo_usuario_id   integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autorizo_nombre       text,
  autorizo_cargo        text,
  correos_notificacion  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at            timestamptz DEFAULT now(),
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.contrato_licencia_cobro_config IS
  'Configuración de cobro licencia y PDF orden de pago (1:1 con contratos).';

CREATE TABLE IF NOT EXISTS public.contrato_orden_pago (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_corte          integer NOT NULL CHECK (numero_corte >= 1),
  periodo_inicio        date NOT NULL,
  periodo_fin           date NOT NULL,
  fecha_emision         date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento     date NOT NULL,
  descripcion_servicio  text NOT NULL,
  cantidad              integer NOT NULL DEFAULT 1 CHECK (cantidad = 1),
  valor_unitario        numeric NOT NULL,
  subtotal              numeric NOT NULL,
  iva_tasa              numeric NOT NULL,
  iva_valor             numeric NOT NULL,
  total                 numeric NOT NULL,
  saldo_cartera         numeric NOT NULL DEFAULT 0,
  total_a_pagar         numeric NOT NULL,
  azure_blob_path       text NOT NULL,
  nombre_archivo        text,
  mime_type             text NOT NULL DEFAULT 'application/pdf',
  tamano_bytes          bigint,
  estado                text NOT NULL DEFAULT 'emitida'
                        CHECK (estado IN ('emitida', 'aprobada', 'facturada', 'anulada')),
  logo_receptor_tipo    text CHECK (logo_receptor_tipo IN ('contratista', 'interventoria', 'ninguno')),
  logo_receptor_ref     text,
  autorizo_nombre       text,
  autorizo_cargo        text,
  datos_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at            timestamptz,
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contrato_orden_pago_corte_unique UNIQUE (contrato_id, numero_corte),
  CONSTRAINT contrato_orden_pago_periodo_check CHECK (periodo_fin >= periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_contrato_orden_pago_contrato_created
  ON public.contrato_orden_pago (contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_orden_pago_contrato_estado
  ON public.contrato_orden_pago (contrato_id, estado);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_orden_pago_periodo_activo
  ON public.contrato_orden_pago (contrato_id, periodo_inicio, periodo_fin)
  WHERE estado IN ('emitida', 'aprobada', 'facturada');

COMMENT ON TABLE public.contrato_orden_pago IS
  'Historial de órdenes de pago PDF; azure_blob_path apunta a claracore-privado.';
