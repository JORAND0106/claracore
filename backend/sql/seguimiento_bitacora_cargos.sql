-- Bitácora: catálogo de cargos personalizados por contrato (opción «Otro»).

CREATE TABLE IF NOT EXISTS public.seguimiento_bitacora_cargo (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  nombre_norm   text NOT NULL,
  activo        boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_bitacora_cargo IS
  'Cargos personalizados de Personal en obra (Bitácora), persistentes por contrato tras «Otro: ¿Cuál?».';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_bitacora_cargo_contrato_nombre
  ON public.seguimiento_bitacora_cargo (contrato_id, nombre_norm)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_bitacora_cargo_contrato_activo
  ON public.seguimiento_bitacora_cargo (contrato_id)
  WHERE activo = true;

NOTIFY pgrst, 'reload schema';
