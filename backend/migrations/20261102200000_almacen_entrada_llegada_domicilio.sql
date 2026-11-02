-- Entradas por domicilio: placa/conductor opcionales.
ALTER TABLE public.almacen_entrada
  ADD COLUMN IF NOT EXISTS llegada_domicilio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.almacen_entrada.llegada_domicilio IS
  'True si el material llegó por domicilio (sin placa/conductor).';

NOTIFY pgrst, 'reload schema';
