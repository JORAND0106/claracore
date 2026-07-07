-- ClaraCore — Módulo de Contabilidad (independiente de obra)
-- Fase 1: esquema, cargo Contador y permisos seed.
-- Ejecutar manualmente en Supabase SQL Editor. Idempotente.
--
-- Dependencias:
--   competencias_contrato_y_permisos.sql
--   permisos_unique_por_contrato.sql
--   contrato_orden_pago.sql (FK opcional en transacciones)
--
-- Reglas de negocio confirmadas:
--   • Contador opera sin contrato de obra (usuarios.contrato_id NULL).
--   • Valor bruto desde orden de pago = subtotal (IVA por separado).
--   • Capitalización: 20% del bruto de ingresos se acumula íntegramente
--     en la cuenta de capitalización (sin distribución 70/30 ni 20/80 por ahora).
--   • Firma de cierre: hash + usuario + timestamp (sin certificado ni OTP).
--   • Acceso: solo cargo Desarrollador y cargo Contador.

-- ── Función para Control de accesos ─────────────────────────────────────────
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'CONTAB', 'Contabilidad', 'Contabilidad'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'contabilidad' OR f.codigo = 'CONTAB'
);

-- ── Cargo Contador ──────────────────────────────────────────────────────────
INSERT INTO public.cargos (nombre)
SELECT 'Contador'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos c WHERE lower(trim(c.nombre)) = 'contador'
);

-- ── Permisos seed: Contador → Contabilidad (sin contrato de obra) ───────────
INSERT INTO public.permisos (
  cargo_id, funcion_id,
  ver, crear, editar, eliminar, validar, exportar,
  contrato_id
)
SELECT
  c.id,
  f.id,
  true, true, true, true, true, true,
  NULL
FROM public.cargos c
CROSS JOIN public.funciones f
WHERE lower(trim(c.nombre)) = 'contador'
  AND f.codigo = 'CONTAB'
  AND NOT EXISTS (
    SELECT 1
    FROM public.permisos p
    WHERE p.cargo_id = c.id
      AND p.funcion_id = f.id
      AND p.contrato_id IS NULL
  );

-- ── Plan de cuentas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contabilidad_categoria (
  id            serial PRIMARY KEY,
  codigo        varchar(16) NOT NULL,
  nombre        varchar(120) NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  activo        boolean NOT NULL DEFAULT true,
  orden         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at    timestamptz,
  updated_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contabilidad_categoria_codigo_unique UNIQUE (codigo)
);

COMMENT ON TABLE public.contabilidad_categoria IS
  'Plan de cuentas simplificado; editable por Desarrollador.';

-- ── Transacciones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contabilidad_transaccion (
  id                      bigserial PRIMARY KEY,
  fecha                   date NOT NULL,
  tipo                    text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  valor_bruto             numeric(18,2) NOT NULL CHECK (valor_bruto >= 0),
  retencion_fuente_tasa   numeric(7,4) NOT NULL DEFAULT 0 CHECK (retencion_fuente_tasa >= 0),
  retencion_fuente_valor  numeric(18,2) NOT NULL DEFAULT 0 CHECK (retencion_fuente_valor >= 0),
  iva_tasa                numeric(7,4) NOT NULL DEFAULT 0 CHECK (iva_tasa >= 0),
  iva_valor               numeric(18,2) NOT NULL DEFAULT 0 CHECK (iva_valor >= 0),
  iva_sentido             text CHECK (iva_sentido IS NULL OR iva_sentido IN ('recaudado', 'pagado')),
  valor_neto              numeric(18,2) NOT NULL,
  categoria_id            integer NOT NULL REFERENCES public.contabilidad_categoria(id),
  centro_costo_tipo       text NOT NULL DEFAULT 'empresa'
                          CHECK (centro_costo_tipo IN ('contrato', 'empresa')),
  contrato_id             integer REFERENCES public.contratos(id) ON DELETE SET NULL,
  fuente_ingreso          text CHECK (fuente_ingreso IS NULL OR fuente_ingreso IN ('licenciamiento', 'servicios')),
  notas                   text,
  orden_pago_id           bigint REFERENCES public.contrato_orden_pago(id) ON DELETE SET NULL,
  origen                  text NOT NULL DEFAULT 'manual'
                          CHECK (origen IN ('manual', 'orden_pago')),
  estado                  text NOT NULL DEFAULT 'activa'
                          CHECK (estado IN ('activa', 'anulada')),
  cierre_mensual_id       bigint,
  soporte_azure_blob_path text,
  soporte_nombre_archivo  text,
  soporte_mime_type       text,
  soporte_tamano_bytes    bigint,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at              timestamptz,
  updated_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contabilidad_tx_centro_costo_check CHECK (
    (centro_costo_tipo = 'empresa' AND contrato_id IS NULL)
    OR (centro_costo_tipo = 'contrato' AND contrato_id IS NOT NULL)
  ),
  CONSTRAINT contabilidad_tx_fuente_ingreso_check CHECK (
    (tipo = 'egreso' AND fuente_ingreso IS NULL)
    OR (tipo = 'ingreso')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_tx_orden_pago_uidx
  ON public.contabilidad_transaccion (orden_pago_id)
  WHERE orden_pago_id IS NOT NULL AND estado = 'activa';

CREATE INDEX IF NOT EXISTS contabilidad_tx_fecha_idx
  ON public.contabilidad_transaccion (fecha DESC);

CREATE INDEX IF NOT EXISTS contabilidad_tx_categoria_idx
  ON public.contabilidad_transaccion (categoria_id);

CREATE INDEX IF NOT EXISTS contabilidad_tx_contrato_idx
  ON public.contabilidad_transaccion (contrato_id)
  WHERE contrato_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contabilidad_tx_cierre_idx
  ON public.contabilidad_transaccion (cierre_mensual_id)
  WHERE cierre_mensual_id IS NOT NULL;

COMMENT ON TABLE public.contabilidad_transaccion IS
  'Ingresos y egresos. orden_pago_id vincula órdenes facturadas (bruto=subtotal, IVA aparte).';

COMMENT ON COLUMN public.contabilidad_transaccion.valor_bruto IS
  'Base gravable sin IVA. Desde orden de pago: subtotal.';

-- ── Movimientos de cuentas especiales (ledger) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.contabilidad_cuenta_movimiento (
  id                bigserial PRIMARY KEY,
  cuenta_tipo       text NOT NULL
                    CHECK (cuenta_tipo IN ('operativa', 'capitalizacion', 'impuestos')),
  subcuenta         text NOT NULL,
  fecha             date NOT NULL,
  monto             numeric(18,2) NOT NULL,
  concepto          text NOT NULL,
  transaccion_id    bigint REFERENCES public.contabilidad_transaccion(id) ON DELETE SET NULL,
  cierre_mensual_id bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contabilidad_cm_subcuenta_check CHECK (
    (cuenta_tipo = 'operativa' AND subcuenta = 'general')
    OR (cuenta_tipo = 'capitalizacion' AND subcuenta IN ('licenciamiento', 'servicios'))
    OR (cuenta_tipo = 'impuestos' AND subcuenta IN ('iva_recaudado', 'iva_pagado', 'retencion_fuente'))
  )
);

CREATE INDEX IF NOT EXISTS contabilidad_cm_fecha_idx
  ON public.contabilidad_cuenta_movimiento (fecha);

CREATE INDEX IF NOT EXISTS contabilidad_cm_cuenta_idx
  ON public.contabilidad_cuenta_movimiento (cuenta_tipo, subcuenta);

CREATE INDEX IF NOT EXISTS contabilidad_cm_transaccion_idx
  ON public.contabilidad_cuenta_movimiento (transaccion_id)
  WHERE transaccion_id IS NOT NULL;

COMMENT ON TABLE public.contabilidad_cuenta_movimiento IS
  'Ledger de cuentas especiales. Capitalización: 20% bruto ingresos acumulado por fuente.';

-- ── Cierre mensual ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contabilidad_cierre_mensual (
  id                              bigserial PRIMARY KEY,
  anio                            integer NOT NULL CHECK (anio >= 2020),
  mes                             integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado                          text NOT NULL DEFAULT 'borrador'
                                  CHECK (estado IN ('borrador', 'aprobado')),
  ingresos_brutos                 numeric(18,2) NOT NULL DEFAULT 0,
  total_deducciones               numeric(18,2) NOT NULL DEFAULT 0,
  total_gastos                    numeric(18,2) NOT NULL DEFAULT 0,
  utilidad_neta                   numeric(18,2) NOT NULL DEFAULT 0,
  flujo_caja_neto                 numeric(18,2) NOT NULL DEFAULT 0,
  saldo_operativa                 numeric(18,2) NOT NULL DEFAULT 0,
  saldo_capitalizacion_lic        numeric(18,2) NOT NULL DEFAULT 0,
  saldo_capitalizacion_srv        numeric(18,2) NOT NULL DEFAULT 0,
  saldo_impuestos_iva_neto        numeric(18,2) NOT NULL DEFAULT 0,
  saldo_impuestos_retencion       numeric(18,2) NOT NULL DEFAULT 0,
  obligaciones_tributarias        jsonb NOT NULL DEFAULT '{}'::jsonb,
  detalle_calculo                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  notas_contador                  text,
  firmado_por_usuario_id          integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  firmado_at                      timestamptz,
  firma_contenido_hash            text,
  aprobado_por_usuario_id         integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  aprobado_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at                      timestamptz,
  updated_by                      integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT contabilidad_cierre_periodo_unique UNIQUE (anio, mes)
);

COMMENT ON TABLE public.contabilidad_cierre_mensual IS
  'Cierre mensual. Aprobado bloquea edición de transacciones del período. Firma: hash+usuario+timestamp.';

COMMENT ON COLUMN public.contabilidad_cierre_mensual.firma_contenido_hash IS
  'SHA-256 del snapshot del cierre al momento de firmar.';

-- FKs diferidas (evita dependencia circular con transacciones y movimientos)
ALTER TABLE public.contabilidad_transaccion
  DROP CONSTRAINT IF EXISTS contabilidad_tx_cierre_fk;
ALTER TABLE public.contabilidad_transaccion
  ADD CONSTRAINT contabilidad_tx_cierre_fk
  FOREIGN KEY (cierre_mensual_id)
  REFERENCES public.contabilidad_cierre_mensual(id) ON DELETE SET NULL;

ALTER TABLE public.contabilidad_cuenta_movimiento
  DROP CONSTRAINT IF EXISTS contabilidad_cm_cierre_fk;
ALTER TABLE public.contabilidad_cuenta_movimiento
  ADD CONSTRAINT contabilidad_cm_cierre_fk
  FOREIGN KEY (cierre_mensual_id)
  REFERENCES public.contabilidad_cierre_mensual(id) ON DELETE SET NULL;

-- ── Seed plan de cuentas ────────────────────────────────────────────────────
INSERT INTO public.contabilidad_categoria (codigo, nombre, tipo, orden) VALUES
  ('ING-LIC', 'Ingresos por licenciamiento',             'ingreso', 10),
  ('ING-SRV', 'Ingresos por servicios',                  'ingreso', 20),
  ('COS-INF', 'Costos de infraestructura tecnológica',   'egreso',  30),
  ('GTO-HON', 'Honorarios profesionales',                'egreso',  40),
  ('GTO-ADM', 'Gastos administrativos',                  'egreso',  50),
  ('GTO-IMP', 'Impuestos y retenciones',                 'egreso',  60)
ON CONFLICT (codigo) DO NOTHING;

-- ── Recargar esquema PostgREST ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Verificación (opcional) ─────────────────────────────────────────────────
SELECT 'funciones' AS tabla, id, codigo, nombre, modulo
FROM public.funciones
WHERE codigo = 'CONTAB';

SELECT 'cargos' AS tabla, id, nombre
FROM public.cargos
WHERE lower(trim(nombre)) = 'contador';

SELECT 'permisos_contador' AS tabla, p.id, c.nombre AS cargo, f.nombre AS funcion,
       p.ver, p.crear, p.editar, p.eliminar, p.validar, p.exportar, p.contrato_id
FROM public.permisos p
JOIN public.cargos c ON c.id = p.cargo_id
JOIN public.funciones f ON f.id = p.funcion_id
WHERE lower(trim(c.nombre)) = 'contador'
  AND f.codigo = 'CONTAB';

SELECT 'categorias' AS tabla, codigo, nombre, tipo, orden
FROM public.contabilidad_categoria
ORDER BY orden;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'contabilidad_%'
ORDER BY table_name;
