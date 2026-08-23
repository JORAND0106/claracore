-- Asegura grants y comentario del catálogo Bitácora de tipo de material
-- (independiente de Almacén). Idempotente si la tabla ya existía.

COMMENT ON TABLE public.seguimiento_bitacora_tipo_material IS
  'Catálogo propio de Bitácora de Obra (tipo de material por contrato). Independiente del catálogo de insumos de Almacén; no compartir ni consultar tablas de Almacén.';

GRANT SELECT, INSERT, UPDATE ON public.seguimiento_bitacora_tipo_material TO service_role;

DO $$
BEGIN
  GRANT USAGE, SELECT ON SEQUENCE public.seguimiento_bitacora_tipo_material_id_seq TO service_role;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
