-- Soft-delete / papelera para armadas y puntos de poligonal (patrón Presupuesto).
-- Retención: 30 días vía dado_de_baja_at (purga manual o futura cron).

ALTER TABLE public.topo_poligonal_estaciones
  ADD COLUMN IF NOT EXISTS dado_de_baja boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dado_de_baja_at timestamptz NULL;

ALTER TABLE public.topo_poligonal_armadas
  ADD COLUMN IF NOT EXISTS dado_de_baja boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dado_de_baja_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_topo_est_papelera
  ON public.topo_poligonal_estaciones (poligonal_id, dado_de_baja_at DESC)
  WHERE dado_de_baja = true;

CREATE INDEX IF NOT EXISTS idx_topo_arm_papelera
  ON public.topo_poligonal_armadas (poligonal_id, dado_de_baja_at DESC)
  WHERE dado_de_baja = true;

CREATE INDEX IF NOT EXISTS idx_topo_est_activas
  ON public.topo_poligonal_estaciones (poligonal_id, orden)
  WHERE dado_de_baja = false;

CREATE INDEX IF NOT EXISTS idx_topo_arm_activas
  ON public.topo_poligonal_armadas (poligonal_id, orden)
  WHERE dado_de_baja = false;

COMMENT ON COLUMN public.topo_poligonal_estaciones.dado_de_baja IS
  'Papelera: true = eliminado lógicamente (recuperable).';
COMMENT ON COLUMN public.topo_poligonal_armadas.dado_de_baja IS
  'Papelera: true = eliminado lógicamente (recuperable).';
