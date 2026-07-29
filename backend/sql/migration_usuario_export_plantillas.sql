-- Plantillas de campos para exportación Excel, por usuario y módulo.
-- Asociadas al usuario que las crea; no se comparten entre usuarios.
CREATE TABLE IF NOT EXISTS usuario_export_plantillas (
    id bigserial PRIMARY KEY,
    usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modulo text NOT NULL CHECK (modulo IN ('sicoe_obra')),
    nombre text NOT NULL,
    campos jsonb NOT NULL DEFAULT '[]'::jsonb,
    creada_en timestamptz NOT NULL DEFAULT now(),
    actualizada_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuario_export_plantillas_nombre_len CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),
    CONSTRAINT usuario_export_plantillas_campos_array CHECK (jsonb_typeof(campos) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_export_plantillas_usuario_modulo_nombre
    ON usuario_export_plantillas (usuario_id, modulo, lower(btrim(nombre)));

CREATE INDEX IF NOT EXISTS idx_usuario_export_plantillas_usuario_modulo
    ON usuario_export_plantillas (usuario_id, modulo);
