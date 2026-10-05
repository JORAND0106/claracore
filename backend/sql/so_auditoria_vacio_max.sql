-- Tope máximo de vacío en auditoría SicoeObra (default 50 m).
-- Solo huecos menores a este valor se consideran hallazgo; los ≥ no.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS sicoe_vacio_max_m numeric(8, 2) DEFAULT 50.00;

COMMENT ON COLUMN public.contratos.sicoe_vacio_max_m IS
  'Tope máximo (m) para alertas de vacío lineal en SicoeObra. Default 50.00; huecos ≥ este valor no son hallazgo.';
