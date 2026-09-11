-- ClaraCore — RRHH: catálogo reutilizable de entidades bancarias
-- Idempotente.

ALTER TABLE public.rrhh_catalogo_opciones DROP CONSTRAINT IF EXISTS rrhh_catalogo_opciones_categoria_check;
ALTER TABLE public.rrhh_catalogo_opciones
  ADD CONSTRAINT rrhh_catalogo_opciones_categoria_check
  CHECK (categoria IN (
    'eps', 'pension', 'cesantias', 'arl',
    'caja_compensacion', 'cargo', 'tipo_contrato', 'parentesco',
    'doc_soporte', 'doc_ingreso', 'banco_entidad'
  ));

COMMENT ON CONSTRAINT rrhh_catalogo_opciones_categoria_check ON public.rrhh_catalogo_opciones IS
  'Incluye banco_entidad para entidades bancarias reutilizables en Registro.';

NOTIFY pgrst, 'reload schema';
