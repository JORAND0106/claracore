-- ClaraCore — Módulos experimentales: SST documental, Ensayos PIP, Integración nube, Auditor IA
-- Ejecutar en Supabase SQL Editor (una vez). Idempotente en lo posible.

-- ── Funciones para Control de accesos (panel Admin) ─────────────────────────
INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'SSTDOC', 'SST documental', 'SST'
WHERE NOT EXISTS (SELECT 1 FROM public.funciones f WHERE lower(trim(f.nombre)) = 'sst documental' OR f.codigo = 'SSTDOC');

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'ENSPIP', 'Ensayos PIP', 'Laboratorio'
WHERE NOT EXISTS (SELECT 1 FROM public.funciones f WHERE lower(trim(f.nombre)) = 'ensayos pip' OR f.codigo = 'ENSPIP');

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'NUVECC', 'Integración nube ClaraCore', 'Administración'
WHERE NOT EXISTS (SELECT 1 FROM public.funciones f WHERE lower(trim(f.nombre)) = 'integración nube claracore' OR f.codigo = 'NUVECC');

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'AUDSST', 'Auditor SST (IA)', 'SST'
WHERE NOT EXISTS (SELECT 1 FROM public.funciones f WHERE lower(trim(f.nombre)) = 'auditor sst (ia)' OR f.codigo = 'AUDSST');

-- ── integraciones_nube ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integraciones_nube (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    proveedor VARCHAR(32) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    folder_id_raiz VARCHAR(256),
    folder_id_sst VARCHAR(256),
    folder_id_sst_personal_contratista VARCHAR(256),
    folder_id_sst_personal_subcontratista VARCHAR(256),
    folder_id_sst_maquinaria_contratista VARCHAR(256),
    folder_id_sst_maquinaria_subcontratista VARCHAR(256),
    folder_id_ensayos VARCHAR(256),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS integraciones_nube_contrato_proveedor_idx
  ON public.integraciones_nube(contrato_id, proveedor);

-- ── SST plantillas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sst_plantillas_documentos (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    tipo VARCHAR(32) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tiene_vencimiento BOOLEAN DEFAULT false,
    dias_vigencia INTEGER,
    obligatorio BOOLEAN DEFAULT true,
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sst_personal (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    cedula VARCHAR(32) NOT NULL,
    cargo VARCHAR(255),
    empresa_tipo VARCHAR(32) NOT NULL,
    subcontratista_id INTEGER REFERENCES public.subcontratistas(id),
    fecha_ingreso DATE,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sst_personal_contrato_idx ON public.sst_personal(contrato_id);

CREATE TABLE IF NOT EXISTS public.sst_maquinaria (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    placa_serial VARCHAR(128) NOT NULL,
    tipo VARCHAR(128),
    marca VARCHAR(128),
    modelo VARCHAR(128),
    propietario VARCHAR(255),
    empresa_tipo VARCHAR(32) NOT NULL,
    subcontratista_id INTEGER REFERENCES public.subcontratistas(id),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sst_maquinaria_contrato_idx ON public.sst_maquinaria(contrato_id);

CREATE TABLE IF NOT EXISTS public.sst_documentos (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    plantilla_id INTEGER REFERENCES public.sst_plantillas_documentos(id),
    entidad_tipo VARCHAR(32) NOT NULL,
    entidad_id INTEGER NOT NULL,
    nombre_archivo VARCHAR(512),
    url_nube TEXT,
    folder_id_mes VARCHAR(256),
    folder_id_entidad VARCHAR(256),
    fecha_subida TIMESTAMPTZ,
    fecha_vigencia DATE,
    mes_vigencia VARCHAR(16),
    estado VARCHAR(32) DEFAULT 'Pendiente',
    revisor_id INTEGER REFERENCES public.usuarios(id),
    comentario_revision TEXT,
    fecha_revision TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sst_docs_contrato_entidad_idx ON public.sst_documentos(contrato_id, entidad_tipo, entidad_id);

-- ── Ensayos PIP ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ensayos_pip (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    nombre_ensayo VARCHAR(255) NOT NULL,
    norma_tecnica VARCHAR(512),
    item_presupuesto VARCHAR(255),
    frecuencia_tipo VARCHAR(64),
    frecuencia_valor NUMERIC,
    frecuencia_unidad VARCHAR(64),
    cantidad_minima INTEGER DEFAULT 1,
    folder_id_nube VARCHAR(256),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ensayos_registros (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    pip_id INTEGER NOT NULL REFERENCES public.ensayos_pip(id) ON DELETE CASCADE,
    nombre_ensayo VARCHAR(255),
    fecha_muestra DATE NOT NULL,
    laboratorio VARCHAR(255),
    resultado_tipo VARCHAR(32),
    resultado_valor NUMERIC,
    nombre_archivo VARCHAR(512),
    url_nube TEXT,
    folder_id_mes VARCHAR(256),
    folder_id_ensayo VARCHAR(256),
    mes_registro VARCHAR(16),
    estado VARCHAR(32) DEFAULT 'Pendiente',
    revisor_id INTEGER REFERENCES public.usuarios(id),
    comentario_revision TEXT,
    fecha_revision TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ensayos_reg_pip_idx ON public.ensayos_registros(pip_id);

CREATE TABLE IF NOT EXISTS public.alertas_documentos (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    tipo_modulo VARCHAR(64) NOT NULL,
    referencia_id INTEGER NOT NULL,
    tipo_alerta VARCHAR(64) NOT NULL,
    mensaje TEXT,
    leida BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auditor SST (IA) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sst_auditorias (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id),
    colaborador_nombre VARCHAR(255),
    colaborador_cedula VARCHAR(64),
    origen VARCHAR(32) NOT NULL,
    total_pdfs INTEGER DEFAULT 0,
    campos_ok INTEGER DEFAULT 0,
    campos_discrepancia INTEGER DEFAULT 0,
    campos_no_encontrado INTEGER DEFAULT 0,
    puntuacion INTEGER,
    tokens_usados INTEGER,
    costo_usd NUMERIC(12, 6),
    resultado_json jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sst_auditorias ADD COLUMN IF NOT EXISTS resultado_json jsonb;

CREATE TABLE IF NOT EXISTS public.sst_personal_importado (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    numero VARCHAR(64),
    empresa VARCHAR(512),
    tipo_contrato VARCHAR(128),
    nombre VARCHAR(255) NOT NULL,
    cedula VARCHAR(64) NOT NULL,
    edad VARCHAR(32),
    sexo VARCHAR(32),
    localidad_residencia VARCHAR(512),
    cargo VARCHAR(255),
    fecha_ingreso VARCHAR(64),
    fecha_retiro VARCHAR(64),
    arl VARCHAR(255),
    clase_riesgo_arl VARCHAR(128),
    fecha_afiliacion_arl VARCHAR(64),
    eps VARCHAR(255),
    afp VARCHAR(255),
    fecha_examen_ingreso VARCHAR(64),
    fecha_examen_periodico VARCHAR(64),
    fecha_examen_egreso VARCHAR(64),
    concepto_medico VARCHAR(512),
    importado_por INTEGER REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sst_personal_importado_contrato_cedula_uq
  ON public.sst_personal_importado(contrato_id, cedula);

-- Si PostgREST aún devuelve PGRST205 ("Could not find the table public.sst_personal"), en SQL Editor:
-- NOTIFY pgrst, 'reload schema';
