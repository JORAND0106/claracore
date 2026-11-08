-- Modo Retroactivo: habilitaciones temporales + marca en entradas/salidas.
-- Idempotente. Tras aplicar: NOTIFY pgrst, 'reload schema'.

CREATE TABLE IF NOT EXISTS public.almacen_habilitacion_retroactivo (
  id                bigserial PRIMARY KEY,
  contrato_id       bigint NOT NULL,
  usuario_id        bigint NOT NULL,
  desde             timestamptz NOT NULL,
  hasta             timestamptz NOT NULL,
  motivo            text,
  habilitado_por    bigint NOT NULL,
  revocado_at       timestamptz,
  revocado_por      bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_almacen_hab_retro_rango CHECK (hasta > desde)
);

COMMENT ON TABLE public.almacen_habilitacion_retroactivo IS
  'Ventana temporal en la que un usuario puede registrar entradas/salidas en modo Retroactivo.';

CREATE INDEX IF NOT EXISTS idx_almacen_hab_retro_contrato_usuario
  ON public.almacen_habilitacion_retroactivo (contrato_id, usuario_id);

CREATE INDEX IF NOT EXISTS idx_almacen_hab_retro_vigente
  ON public.almacen_habilitacion_retroactivo (contrato_id, hasta)
  WHERE revocado_at IS NULL;

ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS es_retroactivo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_aproximada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retroactivo_validado_at timestamptz,
  ADD COLUMN IF NOT EXISTS retroactivo_validado_por bigint;

COMMENT ON COLUMN public.almacen_entrada.es_retroactivo IS
  'True si se registró en modo Retroactivo (fecha del hecho ≠ captura).';
COMMENT ON COLUMN public.almacen_entrada.fecha_aproximada IS
  'True si la fecha del hecho es aproximada.';
COMMENT ON COLUMN public.almacen_entrada.retroactivo_validado_at IS
  'Cuando se valida el registro retroactivo; la marca visible desaparece.';

CREATE INDEX IF NOT EXISTS idx_almacen_entrada_retro_pendiente
  ON public.almacen_entrada (contrato_id)
  WHERE es_retroactivo = true AND retroactivo_validado_at IS NULL;

ALTER TABLE public.almacen_salida
  ADD COLUMN IF NOT EXISTS es_retroactivo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_aproximada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retroactivo_validado_at timestamptz,
  ADD COLUMN IF NOT EXISTS retroactivo_validado_por bigint;

COMMENT ON COLUMN public.almacen_salida.es_retroactivo IS
  'True si se registró en modo Retroactivo.';
COMMENT ON COLUMN public.almacen_salida.fecha_aproximada IS
  'True si la fecha del hecho es aproximada.';
COMMENT ON COLUMN public.almacen_salida.retroactivo_validado_at IS
  'Cuando se valida el registro retroactivo; la marca visible desaparece.';

CREATE INDEX IF NOT EXISTS idx_almacen_salida_retro_pendiente
  ON public.almacen_salida (contrato_id)
  WHERE es_retroactivo = true AND retroactivo_validado_at IS NULL;

NOTIFY pgrst, 'reload schema';
