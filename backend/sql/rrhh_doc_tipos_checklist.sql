-- ClaraCore — Recursos Humanos: catálogo de tipos de documento soporte/ingreso
-- Idempotente.

ALTER TABLE public.rrhh_catalogo_opciones DROP CONSTRAINT IF EXISTS rrhh_catalogo_opciones_categoria_check;
ALTER TABLE public.rrhh_catalogo_opciones
  ADD CONSTRAINT rrhh_catalogo_opciones_categoria_check
  CHECK (categoria IN (
    'eps', 'pension', 'cesantias', 'arl',
    'caja_compensacion', 'cargo', 'tipo_contrato', 'parentesco',
    'doc_soporte', 'doc_ingreso'
  ));

COMMENT ON CONSTRAINT rrhh_catalogo_opciones_categoria_check ON public.rrhh_catalogo_opciones IS
  'Incluye doc_soporte / doc_ingreso para checklist extensible de documentos.';

NOTIFY pgrst, 'reload schema';
