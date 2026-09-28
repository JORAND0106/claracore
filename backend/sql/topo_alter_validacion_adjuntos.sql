-- Adjuntos de imagen en comentarios / validaciones de Topografía.
-- Ejecutar en Supabase tras desplegar el soporte de imagen en popups de validación.

ALTER TABLE IF EXISTS topo_poligonal_comentarios
  ADD COLUMN IF NOT EXISTS adjuntos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS topo_nivelacion_comentarios
  ADD COLUMN IF NOT EXISTS adjuntos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS topo_newpoint_comentarios
  ADD COLUMN IF NOT EXISTS adjuntos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS topo_planillas_tuberia
  ADD COLUMN IF NOT EXISTS comentario_validacion_adjuntos JSONB;

COMMENT ON COLUMN topo_planillas_tuberia.comentario_validacion_adjuntos IS
  'Último respaldo fotográfico de validación: {nivel, estado, adjuntos[{url,nombre,mime}], at}';
