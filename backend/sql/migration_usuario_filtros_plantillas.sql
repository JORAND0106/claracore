-- Plantillas de filtros por usuario y módulo (presupuesto | sicoe_obra).
CREATE TABLE IF NOT EXISTS usuario_filtros_plantillas (
    id bigserial PRIMARY KEY,
    usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modulo text NOT NULL CHECK (modulo IN ('presupuesto', 'sicoe_obra')),
    nombre text NOT NULL,
    filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
    creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuario_filtros_plantillas_usuario_modulo
    ON usuario_filtros_plantillas (usuario_id, modulo);
