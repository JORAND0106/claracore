-- Directorio de transportadores por contrato (Despachador — placa única).
CREATE TABLE IF NOT EXISTS public.almacen_transportador (
  id          bigserial PRIMARY KEY,
  contrato_id integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  placa       text NOT NULL,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT almacen_transportador_placa_uq UNIQUE (contrato_id, placa)
);

CREATE INDEX IF NOT EXISTS idx_almacen_transportador_contrato
  ON public.almacen_transportador (contrato_id);

CREATE INDEX IF NOT EXISTS idx_almacen_transportador_placa
  ON public.almacen_transportador (contrato_id, placa);

COMMENT ON TABLE public.almacen_transportador IS 'Directorio de transportadores por placa — Despachador Almacén de Obra';
COMMENT ON COLUMN public.almacen_transportador.placa IS 'Placa vehicular normalizada (AAA-000)';
COMMENT ON COLUMN public.almacen_transportador.nombre IS 'Nombre del transportador asociado a la placa';
