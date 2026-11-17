-- ClaraCore — Módulo Caja Menor (por contrato, independiente de Contabilidad)
-- Idempotente. Ejecutar en Supabase SQL Editor si la migración no corre sola.
--
-- No comparte tablas, datos ni lógica con contabilidad_*.
-- Un contrato no lee cajas ni gastos de otro.
-- La base de terceros (NIT / cédula + razón social) es única en la plataforma.

-- ── Función para Gestión de Cargos ──────────────────────────────────────────
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'CAJMEN', 'Caja Menor', 'Caja Menor'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'CAJMEN'
     OR lower(trim(coalesce(f.nombre, ''))) IN ('caja menor', 'cajamenor')
);

-- Permisos totales del cargo Desarrollador (la API además hace bypass).
DO $$
DECLARE
  fid integer;
  cargo_dev integer;
BEGIN
  SELECT f.id INTO fid
  FROM public.funciones f
  WHERE upper(trim(coalesce(f.codigo, ''))) = 'CAJMEN'
     OR lower(trim(coalesce(f.nombre, ''))) = 'caja menor'
  ORDER BY f.id
  LIMIT 1;

  SELECT c.id INTO cargo_dev
  FROM public.cargos c
  WHERE lower(trim(coalesce(c.nombre, ''))) = 'desarrollador'
  ORDER BY c.id
  LIMIT 1;

  IF fid IS NULL OR cargo_dev IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
  SELECT cargo_dev, fid, NULL, true, true, true, true, true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.cargo_id = cargo_dev AND p.funcion_id = fid AND p.contrato_id IS NULL
  );

  INSERT INTO public.permisos (cargo_id, funcion_id, contrato_id, ver, crear, editar, eliminar, validar, exportar)
  SELECT cargo_dev, fid, c.id, true, true, true, true, true, true
  FROM public.contratos c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.cargo_id = cargo_dev AND p.funcion_id = fid AND p.contrato_id = c.id
  );
END $$;

-- ── Terceros (plataforma) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caja_menor_tercero (
  id                bigserial PRIMARY KEY,
  documento_norm    text NOT NULL,
  documento_display text NOT NULL,
  razon_social      text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at        timestamptz,
  updated_by        integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT caja_menor_tercero_doc_len CHECK (char_length(documento_norm) BETWEEN 5 AND 15),
  CONSTRAINT caja_menor_tercero_razon_len CHECK (char_length(trim(razon_social)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_menor_tercero_doc
  ON public.caja_menor_tercero (documento_norm);

COMMENT ON TABLE public.caja_menor_tercero IS
  'NIT o cédula y razón social, únicos para toda la plataforma. No guarda contratos ni cajas.';

-- ── Cajas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caja_menor (
  id                      bigserial PRIMARY KEY,
  contrato_id             integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  responsable_id          integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  numero                  integer NOT NULL CHECK (numero > 0),
  estado                  text NOT NULL DEFAULT 'abierta'
                          CHECK (estado IN ('abierta', 'en_legalizacion', 'legalizada')),
  periodo_desde           date,
  periodo_hasta           date,
  observaciones           text,
  control                 text,
  firma_elaboro           text,
  firma_reviso            text,
  firma_aprobo            text,
  saldo_trasladado        numeric(18,2) NOT NULL DEFAULT 0,
  alerta_80_enviada       boolean NOT NULL DEFAULT false,
  solicitada_cierre_en    timestamptz,
  legalizada_en           timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at              timestamptz,
  updated_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_menor_numero
  ON public.caja_menor (contrato_id, responsable_id, numero);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_menor_una_abierta
  ON public.caja_menor (contrato_id, responsable_id)
  WHERE estado = 'abierta';

CREATE INDEX IF NOT EXISTS idx_caja_menor_contrato
  ON public.caja_menor (contrato_id, responsable_id, numero);

COMMENT ON TABLE public.caja_menor IS
  'Caja menor de un responsable dentro de un contrato. Numeración consecutiva por responsable.';

-- ── Consignaciones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caja_menor_ingreso (
  id                bigserial PRIMARY KEY,
  contrato_id       integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  caja_id           bigint NOT NULL REFERENCES public.caja_menor(id) ON DELETE CASCADE,
  fecha             date NOT NULL,
  valor             numeric(18,2) NOT NULL CHECK (valor > 0),
  soporte_blob      text,
  soporte_nombre    text,
  soporte_mime      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_caja_menor_ingreso_caja
  ON public.caja_menor_ingreso (caja_id, fecha);

-- ── Gastos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caja_menor_gasto (
  id                      bigserial PRIMARY KEY,
  contrato_id             integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  caja_id                 bigint NOT NULL REFERENCES public.caja_menor(id) ON DELETE CASCADE,
  consecutivo             integer NOT NULL CHECK (consecutivo > 0),
  fecha                   date NOT NULL,
  tercero_id              bigint REFERENCES public.caja_menor_tercero(id) ON DELETE SET NULL,
  tercero_documento       text NOT NULL,
  documento_norm          text NOT NULL,
  tercero_razon_social    text NOT NULL,
  descripcion             text NOT NULL,
  documento_no            text NOT NULL,
  centro_costos           text NOT NULL,
  valor_bruto             numeric(18,2) NOT NULL DEFAULT 0 CHECK (valor_bruto >= 0),
  iva                     numeric(18,2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
  retenciones             numeric(18,2) NOT NULL DEFAULT 0 CHECK (retenciones >= 0),
  impuesto_consumo        numeric(18,2) NOT NULL DEFAULT 0 CHECK (impuesto_consumo >= 0),
  otros_deducibles        numeric(18,2) NOT NULL DEFAULT 0 CHECK (otros_deducibles >= 0),
  valor_neto              numeric(18,2) NOT NULL CHECK (valor_neto > 0),
  estado_validacion       text NOT NULL DEFAULT 'pendiente'
                          CHECK (estado_validacion IN ('pendiente', 'aprobado', 'rechazado')),
  observacion_validacion  text,
  validado_por            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  validado_en             timestamptz,
  soporte_blob            text,
  soporte_nombre          text,
  soporte_mime            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at              timestamptz,
  updated_by              integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_menor_gasto_consecutivo
  ON public.caja_menor_gasto (caja_id, consecutivo);

CREATE INDEX IF NOT EXISTS idx_caja_menor_gasto_caja
  ON public.caja_menor_gasto (caja_id, consecutivo);

CREATE INDEX IF NOT EXISTS idx_caja_menor_gasto_duplicado
  ON public.caja_menor_gasto (contrato_id, documento_norm, documento_no);

COMMENT ON COLUMN public.caja_menor_gasto.valor_neto IS
  'Bruto + IVA + impuesto al consumo − retenciones − otros deducibles. Es lo que sale de la caja.';

-- ── Saldo pendiente de trasladar ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caja_menor_saldo_pendiente (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  responsable_id        integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  caja_origen_id        bigint NOT NULL REFERENCES public.caja_menor(id) ON DELETE CASCADE,
  saldo                 numeric(18,2) NOT NULL,
  aplicado_en_caja_id   bigint REFERENCES public.caja_menor(id) ON DELETE SET NULL,
  aplicado_en           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_caja_menor_saldo_origen UNIQUE (caja_origen_id)
);

CREATE INDEX IF NOT EXISTS idx_caja_menor_saldo_pendiente
  ON public.caja_menor_saldo_pendiente (contrato_id, responsable_id)
  WHERE aplicado_en_caja_id IS NULL;

COMMENT ON TABLE public.caja_menor_saldo_pendiente IS
  'Saldo de una caja legalizada que aún no tiene caja abierta del mismo responsable.';

-- Sin este GRANT el rol del API no ve las tablas y PostgREST responde Not Found.
DO $$
DECLARE
  t text;
  s text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'caja_menor',
    'caja_menor_ingreso',
    'caja_menor_gasto',
    'caja_menor_tercero',
    'caja_menor_saldo_pendiente'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla public.% . Ejecute el SQL completo de Caja Menor.', t;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      t
    );
  END LOOP;

  FOR s IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname LIKE 'caja_menor%'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
