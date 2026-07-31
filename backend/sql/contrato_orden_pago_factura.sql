-- Factura emitida (soporte gráfico) asociada a cada orden de pago de licenciamiento.
-- Contenedor Azure privado; se guarda ruta, no URL pública.

alter table public.contrato_orden_pago
  add column if not exists factura_azure_blob_path text,
  add column if not exists factura_nombre_archivo text,
  add column if not exists factura_mime_type text,
  add column if not exists factura_tamano_bytes bigint,
  add column if not exists factura_uploaded_at timestamptz,
  add column if not exists factura_uploaded_by integer references public.usuarios (id) on delete set null;

comment on column public.contrato_orden_pago.factura_azure_blob_path is
  'Ruta en claracore-privado de la factura emitida (PDF o imagen) adjunta a la orden.';
comment on column public.contrato_orden_pago.factura_nombre_archivo is
  'Nombre original/normalizado del archivo de factura emitida.';

select pg_notify('pgrst', 'reload schema');
