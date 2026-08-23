-- Bitácora de Obra: catálogo INDEPENDIENTE de tipo de material por contrato.
-- NO relacionado con el catálogo de insumos de Almacén (almacen_insumo, etc.).
-- Solo alimenta el autocompletado de «Tipo de material» en Materiales del Reporte Diario.

CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_tipo_material (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  nombre_norm   text NOT NULL,
  activo        boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_bitacora_tipo_material IS
  'Catálogo propio de Bitácora de Obra (tipo de material por contrato). Independiente del catálogo de insumos de Almacén; no compartir ni consultar tablas de Almacén.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_tipo_mat_contrato_nombre
  ON public.seguimiento_bitacora_tipo_material (contrato_id, nombre_norm)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_tipo_mat_contrato_activo
  ON public.seguimiento_bitacora_tipo_material (contrato_id)
  WHERE activo = true;

GRANT SELECT, INSERT, UPDATE ON public.seguimiento_bitacora_tipo_material TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.seguimiento_bitacora_tipo_material_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
