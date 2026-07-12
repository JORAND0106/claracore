-- Campos de contacto del proveedor (catálogo insumos / PDF Orden de Compra)
ALTER TABLE public.almacen_proveedor
  ADD COLUMN IF NOT EXISTS contacto_email text,
  ADD COLUMN IF NOT EXISTS contacto_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_telefono text;

COMMENT ON COLUMN public.almacen_proveedor.contacto_email IS 'Correo de contacto comercial del proveedor';
COMMENT ON COLUMN public.almacen_proveedor.contacto_nombre IS 'Nombre del comercial o persona de contacto';
COMMENT ON COLUMN public.almacen_proveedor.contacto_telefono IS 'Teléfono de contacto del proveedor';
