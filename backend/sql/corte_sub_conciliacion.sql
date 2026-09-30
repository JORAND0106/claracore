-- Conciliación del Corte de subcontratista (CC-SUB-001):
-- estado enviado/conciliado, snapshot AIU, catálogo de otros conceptos y soportes.

CREATE TABLE IF NOT EXISTS public.corte_sub_conciliacion (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL,
  corte_id bigint NOT NULL,
  subcontratista_id bigint NOT NULL,
  estado text NOT NULL DEFAULT 'borrador',
  pct_administracion numeric(10, 4),
  pct_imprevistos numeric(10, 4),
  pct_utilidad numeric(10, 4),
  pct_iva_utilidad numeric(10, 4),
  costo_directo numeric(18, 0) NOT NULL DEFAULT 0,
  valor_administracion numeric(18, 0) NOT NULL DEFAULT 0,
  valor_imprevistos numeric(18, 0) NOT NULL DEFAULT 0,
  valor_utilidad numeric(18, 0) NOT NULL DEFAULT 0,
  valor_iva_utilidad numeric(18, 0) NOT NULL DEFAULT 0,
  costo_directo_mas_aiu numeric(18, 0) NOT NULL DEFAULT 0,
  total_otros_conceptos numeric(18, 0) NOT NULL DEFAULT 0,
  gran_total numeric(18, 0) NOT NULL DEFAULT 0,
  enviado_en timestamptz,
  enviado_por uuid,
  reabierto_en timestamptz,
  reabierto_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corte_sub_conciliacion_estado_chk
    CHECK (estado IN ('borrador', 'enviado')),
  CONSTRAINT corte_sub_conciliacion_corte_unique UNIQUE (corte_id)
);

CREATE INDEX IF NOT EXISTS idx_corte_sub_conc_sub_estado
  ON public.corte_sub_conciliacion (subcontratista_id, estado);

CREATE INDEX IF NOT EXISTS idx_corte_sub_conc_contrato
  ON public.corte_sub_conciliacion (contrato_id);

COMMENT ON TABLE public.corte_sub_conciliacion IS
  'Conciliación CC-SUB-001: AIU desglosado + otros conceptos. Solo estado=enviado entra en acumulados de cortes posteriores del mismo subcontratista.';

CREATE TABLE IF NOT EXISTS public.corte_sub_conceptos_catalogo (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL,
  descripcion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corte_sub_conceptos_catalogo_unique
    UNIQUE (contrato_id, descripcion)
);

CREATE INDEX IF NOT EXISTS idx_corte_sub_conceptos_cat_contrato
  ON public.corte_sub_conceptos_catalogo (contrato_id);

COMMENT ON TABLE public.corte_sub_conceptos_catalogo IS
  'Catálogo compartido de descripciones de otros conceptos por contrato (solo texto, sin valores).';

CREATE TABLE IF NOT EXISTS public.corte_sub_otros_conceptos (
  id bigserial PRIMARY KEY,
  conciliacion_id bigint NOT NULL
    REFERENCES public.corte_sub_conciliacion(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  descripcion text NOT NULL DEFAULT '',
  unidad text,
  cantidad numeric(18, 4) NOT NULL DEFAULT 0,
  valor_unitario numeric(18, 2) NOT NULL DEFAULT 0,
  costo_total numeric(18, 0) NOT NULL DEFAULT 0,
  soporte_azure_path text,
  soporte_nombre text,
  soporte_mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corte_sub_otros_conc
  ON public.corte_sub_otros_conceptos (conciliacion_id, orden);

COMMENT ON TABLE public.corte_sub_otros_conceptos IS
  'Otros conceptos de cobro del corte (sin AIU/IVA). costo_total = cantidad × valor_unitario redondeado a 0 dp.';
