-- Metadatos de correo en el registro de envío de OC (remitente, Reply-To, CC).
-- Preparado para CC fijos por contrato (columna reservada; sin UI en este paso).

ALTER TABLE public.almacen_orden_compra_envio
  ADD COLUMN IF NOT EXISTS remitente text;

ALTER TABLE public.almacen_orden_compra_envio
  ADD COLUMN IF NOT EXISTS reply_to text;

ALTER TABLE public.almacen_orden_compra_envio
  ADD COLUMN IF NOT EXISTS cc text;

COMMENT ON COLUMN public.almacen_orden_compra_envio.remitente IS
  'From visible del envío (p. ej. Nombre (ClaraCore) <contactenos@…>).';
COMMENT ON COLUMN public.almacen_orden_compra_envio.reply_to IS
  'Reply-To efectivo (correo de quien aprobó, o redirección de prueba).';
COMMENT ON COLUMN public.almacen_orden_compra_envio.cc IS
  'Direcciones en copia (CC), separadas por coma.';

-- Lista fija futura de CC por contrato (sin pantalla aún).
CREATE TABLE IF NOT EXISTS public.almacen_contrato_oc_cc (
  id              bigserial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  email           text NOT NULL,
  nombre          text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_contrato_oc_cc_uq UNIQUE (contrato_id, email)
);

CREATE INDEX IF NOT EXISTS idx_almacen_contrato_oc_cc_contrato
  ON public.almacen_contrato_oc_cc (contrato_id)
  WHERE activo;

COMMENT ON TABLE public.almacen_contrato_oc_cc IS
  'CC fijos por contrato para envíos de OC (reservado; la UI se construye después).';

NOTIFY pgrst, 'reload schema';
