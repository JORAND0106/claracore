-- Salidas de material — Almacén de Obra
-- Despacho desde almacén hacia frente de obra, contra entradas por PK-ID.

CREATE TABLE IF NOT EXISTS public.almacen_salida (
  id                    bigserial PRIMARY KEY,
  contrato_id           integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_salida         integer NOT NULL,
  fecha_hora_salida     timestamptz NOT NULL DEFAULT now(),
  receptor_usuario_id   integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  pk_id                 text,
  pk_id_id              integer,
  tramo                 text,
  costado               text,
  abscisa_inicial       text,
  abscisa_final         text,
  entrada_item_id       bigint NOT NULL REFERENCES public.almacen_entrada_item(id) ON DELETE RESTRICT,
  cantidad_salida       numeric(18, 4) NOT NULL CHECK (cantidad_salida > 0),
  observaciones         text,
  salida_pdf_blob_path  text,
  salida_pdf_nombre     text,
  salida_pdf_mime       text,
  created_by            integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_salida_numero_uq UNIQUE (contrato_id, numero_salida)
);

CREATE INDEX IF NOT EXISTS idx_almacen_salida_contrato
  ON public.almacen_salida (contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacen_salida_entrada_item
  ON public.almacen_salida (entrada_item_id);

CREATE INDEX IF NOT EXISTS idx_almacen_salida_pk
  ON public.almacen_salida (contrato_id, pk_id);

NOTIFY pgrst, 'reload schema';
