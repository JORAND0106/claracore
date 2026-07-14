-- Firma digital en Orden de Compra (snapshot al aprobar solicitud).
ALTER TABLE public.almacen_orden_compra
  ADD COLUMN IF NOT EXISTS aprobador_firma_imagen_url text,
  ADD COLUMN IF NOT EXISTS solicitante_firma_imagen_url text;

COMMENT ON COLUMN public.almacen_orden_compra.aprobador_firma_imagen_url IS
  'URL de firma del aprobador (perfil usuario) al generar la OC.';
COMMENT ON COLUMN public.almacen_orden_compra.solicitante_firma_imagen_url IS
  'URL de firma del solicitante (perfil usuario) al generar la OC, si existía.';
