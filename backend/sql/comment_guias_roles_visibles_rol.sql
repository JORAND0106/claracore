-- Alinea comentario con el significado real: roles (tabla roles / usuarios.rol_id).
-- Ejecutar si ya aplicaste create_guias.sql con el comentario anterior de «cargos».

COMMENT ON COLUMN guias.roles_visibles IS 'IDs de la tabla roles (usuarios.rol_id). Vacío = visible para todos los roles.';
