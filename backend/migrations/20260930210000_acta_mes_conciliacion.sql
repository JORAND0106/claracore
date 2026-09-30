-- Conciliación del Informe de ejecución mensual (CC-MES-001):
-- estado enviado/conciliado, snapshot AIU del contrato, amortización y otros conceptos.
-- Reutiliza el catálogo compartido corte_sub_conceptos_catalogo (por contrato).

CREATE TABLE IF NOT EXISTS public.acta_mes_conciliacion (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL,
  acta_id bigint NOT NULL,
  estado text NOT NULL DEFAULT 'borrador',
  pct_administracion numeric(10, 4),
  pct_imprevistos numeric(10, 4),
  pct_utilidad numeric(10, 4),
  pct_iva_utilidad numeric(10, 4),
  pct_aiu numeric(10, 4),
  costo_directo numeric(18, 0) NOT NULL DEFAULT 0,
  valor_administracion numeric(18, 0) NOT NULL DEFAULT 0,
  valor_imprevistos numeric(18, 0) NOT NULL DEFAULT 0,
  valor_utilidad numeric(18, 0) NOT NULL DEFAULT 0,
  valor_iva_utilidad numeric(18, 0) NOT NULL DEFAULT 0,
  valor_aiu numeric(18, 0) NOT NULL DEFAULT 0,
  costo_directo_mas_aiu numeric(18, 0) NOT NULL DEFAULT 0,
  anticipo_entregado numeric(18, 0) NOT NULL DEFAULT 0,
  amortizado_anterior numeric(18, 0) NOT NULL DEFAULT 0,
  pct_amortizacion numeric(12, 6),
  amortizacion_presente numeric(18, 0) NOT NULL DEFAULT 0,
  saldo_por_amortizar numeric(18, 0) NOT NULL DEFAULT 0,
  subtotal_despues_amortizacion numeric(18, 0) NOT NULL DEFAULT 0,
  total_otros_conceptos numeric(18, 0) NOT NULL DEFAULT 0,
  gran_total numeric(18, 0) NOT NULL DEFAULT 0,
  enviado_en timestamptz,
  enviado_por uuid,
  reabierto_en timestamptz,
  reabierto_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acta_mes_conciliacion_estado_chk
    CHECK (estado IN ('borrador', 'enviado')),
  CONSTRAINT acta_mes_conciliacion_acta_unique UNIQUE (acta_id)
);

CREATE INDEX IF NOT EXISTS idx_acta_mes_conc_contrato_estado
  ON public.acta_mes_conciliacion (contrato_id, estado);

CREATE INDEX IF NOT EXISTS idx_acta_mes_conc_contrato
  ON public.acta_mes_conciliacion (contrato_id);

COMMENT ON TABLE public.acta_mes_conciliacion IS
  'Conciliación CC-MES-001: AIU del contrato + amortización anticipo + otros conceptos. Solo estado=enviado entra en acumulados de actas posteriores del mismo contrato. Reabrir → borrador lo excluye hasta reenviar.';

CREATE TABLE IF NOT EXISTS public.acta_mes_otros_conceptos (
  id bigserial PRIMARY KEY,
  conciliacion_id bigint NOT NULL
    REFERENCES public.acta_mes_conciliacion(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_acta_mes_otros_conc
  ON public.acta_mes_otros_conceptos (conciliacion_id, orden);

COMMENT ON TABLE public.acta_mes_otros_conceptos IS
  'Otros conceptos del informe mensual (sin AIU/IVA). costo_total = cantidad × valor_unitario redondeado a 0 dp. Catálogo de descripciones: corte_sub_conceptos_catalogo.';
