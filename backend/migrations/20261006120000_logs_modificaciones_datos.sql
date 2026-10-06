-- Log de modificaciones de datos.
-- La regla de negocio (qué cambió, antes y después) vive en el backend.
-- Estas columnas solo facilitan buscar y agrupar lo que el backend ya registró.
-- La plataforma no actualiza ni borra filas de logs: el cliente de datos lo rechaza.

ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS busqueda text;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS registro_etiqueta text;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS carga_id text;

COMMENT ON COLUMN public.logs.busqueda IS 'Texto legible para filtrar modificaciones (usuario, registro, campo, valores).';
COMMENT ON COLUMN public.logs.registro_etiqueta IS 'Nombre reconocible del registro afectado.';
COMMENT ON COLUMN public.logs.carga_id IS 'Agrupa los registros de una misma carga masiva o importación.';

CREATE INDEX IF NOT EXISTS idx_logs_categoria_created ON public.logs (categoria, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_carga_id ON public.logs (carga_id);

-- Impide que el rol del navegador edite o borre el log. El backend inserta con service_role.
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.logs FROM %I', rol);
    END IF;
  END LOOP;
END $$;
