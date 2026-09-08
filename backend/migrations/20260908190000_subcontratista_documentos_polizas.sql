-- ClaraCore — Subcontratistas: pólizas + documentos requeridos para corte
-- Idempotente. Metadatos en Supabase; binarios en claracore-privado (Azure).

-- ── Config anticipación alertas de pólizas (por contrato) ────────────────────
CREATE TABLE IF NOT EXISTS public.subcontratista_poliza_alerta_config (
  contrato_id           integer PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  dias_alerta_1         integer NOT NULL DEFAULT 30 CHECK (dias_alerta_1 >= 1 AND dias_alerta_1 <= 365),
  dias_alerta_2         integer NOT NULL DEFAULT 15 CHECK (dias_alerta_2 >= 1 AND dias_alerta_2 <= 365),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.subcontratista_poliza_alerta_config IS
  'Umbrales de anticipación (días) para alertas de vencimiento de pólizas por contrato. Defaults 30 y 15.';

-- ── Pólizas (historial: nunca se borra al renovar) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontratista_polizas (
  id                    bigserial PRIMARY KEY,
  subcontratista_id     integer NOT NULL REFERENCES public.subcontratistas(id) ON DELETE CASCADE,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo                  text NOT NULL
                        CHECK (tipo IN ('garantia', 'responsabilidad_civil', 'otro')),
  tipo_otro_texto       text,
  fecha_vencimiento     date NOT NULL,
  valor_asegurado       numeric(18, 2),
  azure_blob_path       text,
  nombre_archivo        varchar(255),
  mime_type             text,
  tamano_bytes          bigint CHECK (tamano_bytes IS NULL OR tamano_bytes > 0),
  estado                text NOT NULL DEFAULT 'vigente'
                        CHECK (estado IN ('vigente', 'vencida', 'reemplazada')),
  replaces_id           bigint REFERENCES public.subcontratista_polizas(id) ON DELETE SET NULL,
  replaced_by_id        bigint REFERENCES public.subcontratista_polizas(id) ON DELETE SET NULL,
  alerta_30_enviada_at  timestamptz,
  alerta_15_enviada_at  timestamptz,
  alerta_vencida_enviada_at timestamptz,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at            timestamptz,
  updated_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT subcontratista_polizas_otro_texto_chk
    CHECK (
      (tipo = 'otro' AND coalesce(trim(tipo_otro_texto), '') <> '')
      OR (tipo <> 'otro' AND tipo_otro_texto IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS subcontratista_polizas_sub_idx
  ON public.subcontratista_polizas (subcontratista_id, estado);

CREATE INDEX IF NOT EXISTS subcontratista_polizas_vence_idx
  ON public.subcontratista_polizas (contrato_id, fecha_vencimiento)
  WHERE estado = 'vigente';

COMMENT ON TABLE public.subcontratista_polizas IS
  'Pólizas de subcontratista con historial. Al renovar, la anterior queda estado=reemplazada.';

-- ── Documentos requeridos para corte ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontratista_documentos (
  id                    bigserial PRIMARY KEY,
  subcontratista_id     integer NOT NULL REFERENCES public.subcontratistas(id) ON DELETE CASCADE,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  tipo                  text NOT NULL
                        CHECK (tipo IN ('contrato_firmado', 'propuesta_economica', 'seguridad_social')),
  version_label         text,
  periodo               text,  -- YYYY-MM para seguridad_social
  corte_id              integer REFERENCES public.subcontratista_cortes(id) ON DELETE SET NULL,
  vigente               boolean NOT NULL DEFAULT true,
  azure_blob_path       text NOT NULL,
  nombre_archivo        varchar(255) NOT NULL,
  mime_type             text NOT NULL,
  tamano_bytes          bigint NOT NULL CHECK (tamano_bytes > 0),
  hash_sha256           varchar(64),
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  eliminado_en          timestamptz,
  eliminado_por         integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT subcontratista_documentos_periodo_chk
    CHECK (
      (tipo = 'seguridad_social' AND periodo ~ '^\d{4}-\d{2}$')
      OR (tipo <> 'seguridad_social')
    )
);

CREATE INDEX IF NOT EXISTS subcontratista_documentos_sub_tipo_idx
  ON public.subcontratista_documentos (subcontratista_id, tipo)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS subcontratista_documentos_ss_periodo_idx
  ON public.subcontratista_documentos (subcontratista_id, periodo)
  WHERE tipo = 'seguridad_social' AND eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS subcontratista_documentos_corte_idx
  ON public.subcontratista_documentos (corte_id)
  WHERE corte_id IS NOT NULL AND eliminado_en IS NULL;

COMMENT ON TABLE public.subcontratista_documentos IS
  'Documentos requeridos para generar cortes: contrato firmado, propuesta económica (versionados) y seguridad social (mensual).';

COMMENT ON COLUMN public.subcontratista_documentos.vigente IS
  'Para contrato_firmado y propuesta_economica: basta una versión vigente. Para seguridad_social se valida por período del corte.';

-- ── RLS (defensa en profundidad; acceso real vía service role / API) ─────────
ALTER TABLE public.subcontratista_poliza_alerta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontratista_polizas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontratista_documentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontratista_poliza_alerta_config'
      AND policyname = 'subcontratista_poliza_alerta_config_service'
  ) THEN
    CREATE POLICY subcontratista_poliza_alerta_config_service
      ON public.subcontratista_poliza_alerta_config
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontratista_polizas'
      AND policyname = 'subcontratista_polizas_service'
  ) THEN
    CREATE POLICY subcontratista_polizas_service
      ON public.subcontratista_polizas
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontratista_documentos'
      AND policyname = 'subcontratista_documentos_service'
  ) THEN
    CREATE POLICY subcontratista_documentos_service
      ON public.subcontratista_documentos
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
