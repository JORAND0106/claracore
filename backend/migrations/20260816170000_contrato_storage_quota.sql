-- ClaraCore — Contabilización de almacenamiento Azure por contrato
-- Umbral gratuito + tarifas por rango (referencia) + uso por tipo.
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS public.storage_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  umbral_gratuito_bytes bigint NOT NULL DEFAULT 5368709120, -- 5 GiB
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT chk_storage_config_umbral_nonneg CHECK (umbral_gratuito_bytes >= 0)
);

INSERT INTO public.storage_config (id, umbral_gratuito_bytes)
VALUES (1, 5368709120)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.storage_config IS
  'Configuración global de almacenamiento: umbral gratuito por contrato (editable por Desarrollador).';

CREATE TABLE IF NOT EXISTS public.storage_tarifas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  capacidad_bytes bigint NOT NULL,
  precio_cop_mes numeric(14, 2) NOT NULL DEFAULT 0,
  orden integer NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_storage_tarifas_capacidad_pos CHECK (capacidad_bytes > 0),
  CONSTRAINT chk_storage_tarifas_precio_nonneg CHECK (precio_cop_mes >= 0),
  CONSTRAINT uq_storage_tarifas_nombre UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS idx_storage_tarifas_activo_orden
  ON public.storage_tarifas (activo, orden, capacidad_bytes);

COMMENT ON TABLE public.storage_tarifas IS
  'Planes/rangos de referencia de almacenamiento adicional (capacidad total por contrato). Sin cobro automático.';

-- Semillas de ejemplo (idempotentes por nombre)
INSERT INTO public.storage_tarifas (nombre, capacidad_bytes, precio_cop_mes, orden, activo, notas)
VALUES
  ('Hasta 100 GB', 107374182400, 0, 10, true, 'Plan de referencia — ajustar precio COP/mes'),
  ('Hasta 1 TB', 1099511627776, 0, 20, true, 'Plan de referencia — ajustar precio COP/mes')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.contrato_storage_uso (
  contrato_id bigint PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  bytes_fotos bigint NOT NULL DEFAULT 0,
  bytes_documentos bigint NOT NULL DEFAULT 0,
  bytes_otros bigint NOT NULL DEFAULT 0,
  bytes_total bigint NOT NULL DEFAULT 0,
  tarifa_id bigint REFERENCES public.storage_tarifas(id) ON DELETE SET NULL,
  limite_override_bytes bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_contrato_storage_fotos_nonneg CHECK (bytes_fotos >= 0),
  CONSTRAINT chk_contrato_storage_docs_nonneg CHECK (bytes_documentos >= 0),
  CONSTRAINT chk_contrato_storage_otros_nonneg CHECK (bytes_otros >= 0),
  CONSTRAINT chk_contrato_storage_total_nonneg CHECK (bytes_total >= 0),
  CONSTRAINT chk_contrato_storage_override_nonneg CHECK (
    limite_override_bytes IS NULL OR limite_override_bytes >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_contrato_storage_uso_total
  ON public.contrato_storage_uso (bytes_total DESC);

COMMENT ON TABLE public.contrato_storage_uso IS
  'Uso de almacenamiento Azure contabilizado por contrato (fotos / documentos / otros).';

-- Ajuste atómico de uso (deltas pueden ser negativos). Evita race en cargas concurrentes.
CREATE OR REPLACE FUNCTION public.storage_adjust_uso(
  p_contrato_id bigint,
  p_delta_fotos bigint DEFAULT 0,
  p_delta_documentos bigint DEFAULT 0,
  p_delta_otros bigint DEFAULT 0
)
RETURNS public.contrato_storage_uso
LANGUAGE plpgsql
AS $$
DECLARE
  r public.contrato_storage_uso;
BEGIN
  IF p_contrato_id IS NULL OR p_contrato_id <= 0 THEN
    RAISE EXCEPTION 'contrato_id inválido';
  END IF;

  INSERT INTO public.contrato_storage_uso (
    contrato_id, bytes_fotos, bytes_documentos, bytes_otros, bytes_total, updated_at
  )
  VALUES (
    p_contrato_id,
    GREATEST(0, COALESCE(p_delta_fotos, 0)),
    GREATEST(0, COALESCE(p_delta_documentos, 0)),
    GREATEST(0, COALESCE(p_delta_otros, 0)),
    GREATEST(
      0,
      COALESCE(p_delta_fotos, 0) + COALESCE(p_delta_documentos, 0) + COALESCE(p_delta_otros, 0)
    ),
    now()
  )
  ON CONFLICT (contrato_id) DO UPDATE SET
    bytes_fotos = GREATEST(0, public.contrato_storage_uso.bytes_fotos + COALESCE(p_delta_fotos, 0)),
    bytes_documentos = GREATEST(
      0, public.contrato_storage_uso.bytes_documentos + COALESCE(p_delta_documentos, 0)
    ),
    bytes_otros = GREATEST(0, public.contrato_storage_uso.bytes_otros + COALESCE(p_delta_otros, 0)),
    bytes_total = GREATEST(
      0,
      public.contrato_storage_uso.bytes_fotos + COALESCE(p_delta_fotos, 0)
      + public.contrato_storage_uso.bytes_documentos + COALESCE(p_delta_documentos, 0)
      + public.contrato_storage_uso.bytes_otros + COALESCE(p_delta_otros, 0)
    ),
    updated_at = now()
  RETURNING * INTO r;

  -- Recalcular total desde columnas (más seguro tras GREATEST por columna)
  UPDATE public.contrato_storage_uso
  SET bytes_total = bytes_fotos + bytes_documentos + bytes_otros,
      updated_at = now()
  WHERE contrato_id = p_contrato_id
  RETURNING * INTO r;

  RETURN r;
END;
$$;

COMMENT ON FUNCTION public.storage_adjust_uso IS
  'Suma/resta bytes de uso por tipo de forma atómica para un contrato.';

NOTIFY pgrst, 'reload schema';
