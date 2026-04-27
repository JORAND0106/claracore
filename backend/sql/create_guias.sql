-- Manuales de usuario integrados en ClaraCore (globales; contrato_id opcional/null).
CREATE TABLE IF NOT EXISTS guias (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contratos(id),
    titulo VARCHAR NOT NULL,
    slug VARCHAR UNIQUE NOT NULL,
    modulo VARCHAR,
    descripcion_corta TEXT,
    bloques JSONB DEFAULT '[]'::jsonb,
    roles_visibles INTEGER[] DEFAULT '{}'::integer[],
    publicado BOOLEAN DEFAULT false,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guias_slug ON guias (slug);
CREATE INDEX IF NOT EXISTS idx_guias_publicado ON guias (publicado);

COMMENT ON COLUMN guias.contrato_id IS 'Opcional; guías globales con NULL.';
COMMENT ON COLUMN guias.roles_visibles IS 'IDs de la tabla roles (usuarios.rol_id). Vacío = visible para todos los roles.';
COMMENT ON COLUMN guias.bloques IS 'Array JSON: texto, imagen {url,caption}, subtítulo.';
