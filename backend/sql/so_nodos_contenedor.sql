-- Nodo contenedor de reportes (SicoeObra).
-- Un punto en el plano aloaja N reportes tipo nodo dentro del radio del contrato.
-- Depende de so_reportes_dibujo.sql / so_huellas_nodo_poligono.sql.

CREATE TABLE IF NOT EXISTS public.so_nodos_contenedor (
  id bigserial PRIMARY KEY,
  contrato_id bigint NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  coord_lat double precision NOT NULL,
  coord_lng double precision NOT NULL,
  label text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_nodos_contenedor_contrato
  ON public.so_nodos_contenedor (contrato_id);

COMMENT ON TABLE public.so_nodos_contenedor IS
  'Entidad puntual única en el plano. Alooja reportes tipo nodo dentro del radio configurable (sicoe_radio_nodo_m).';

ALTER TABLE public.so_reportes
  ADD COLUMN IF NOT EXISTS nodo_contenedor_id bigint
    REFERENCES public.so_nodos_contenedor(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_so_reportes_nodo_contenedor
  ON public.so_reportes (nodo_contenedor_id)
  WHERE nodo_contenedor_id IS NOT NULL;

COMMENT ON COLUMN public.so_reportes.nodo_contenedor_id IS
  'Contenedor puntual donde se aloja este reporte (dibujo tipo nodo). Varios reportes pueden compartir el mismo id.';
