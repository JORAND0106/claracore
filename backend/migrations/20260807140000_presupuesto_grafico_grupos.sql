-- Grupos de gráficos asociados a múltiples registros de presupuesto (memorias de ítem).

CREATE TABLE IF NOT EXISTS public.presupuesto_grafico_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id integer NOT NULL REFERENCES public.contratos (id) ON DELETE CASCADE,
  titulo text,
  created_by integer REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.presupuesto_grafico_grupo_regs (
  grupo_id uuid NOT NULL REFERENCES public.presupuesto_grafico_grupos (id) ON DELETE CASCADE,
  presupuesto_id integer NOT NULL REFERENCES public.presupuesto (id) ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, presupuesto_id)
);

CREATE TABLE IF NOT EXISTS public.presupuesto_grafico_imagenes (
  id bigserial PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES public.presupuesto_grafico_grupos (id) ON DELETE CASCADE,
  url text NOT NULL,
  blob_path text,
  descripcion text,
  origen text DEFAULT 'upload',
  orden integer NOT NULL DEFAULT 0,
  content_hash text,
  created_by integer REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppto_grafico_grupos_contrato
  ON public.presupuesto_grafico_grupos (contrato_id);

CREATE INDEX IF NOT EXISTS idx_ppto_grafico_grupo_regs_presupuesto
  ON public.presupuesto_grafico_grupo_regs (presupuesto_id);

CREATE INDEX IF NOT EXISTS idx_ppto_grafico_imagenes_grupo
  ON public.presupuesto_grafico_imagenes (grupo_id, orden);

COMMENT ON TABLE public.presupuesto_grafico_grupos IS
  'Grupo de gráficos cargados desde selección múltiple en Presupuesto.';
COMMENT ON TABLE public.presupuesto_grafico_grupo_regs IS
  'Registros de presupuesto pertenecientes a un grupo de gráficos.';
COMMENT ON TABLE public.presupuesto_grafico_imagenes IS
  'Imágenes (Azure Blob URL) de un grupo; se repiten en cada ítem involucrado al exportar memorias.';

NOTIFY pgrst, 'reload schema';
