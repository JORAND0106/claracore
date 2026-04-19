-- ClaraCore Documentación (CCD): configuración de firmas por contrato y código de formato.
-- Ejecutar en Supabase SQL Editor (una vez), en el MISMO proyecto que usa SUPABASE_URL del backend.
-- Si ves error Postgres 42703 "column ... ccd_firma_config does not exist", este script no se aplicó ahí.
--
-- Elaboró / Revisó / Aprobó (texto + usuario_id opcional). En CC-SUB el «Aprobó» del pie puede seguir
-- viniendo del subcontratista en PDF; en CC-SEM / CC-MES la biblioteca usa aprobo_* de esta tabla.
--
-- Si no puedes crear la tabla todavía, la columna siguiente permite que el backend guarde
-- la misma información en JSON por contrato (fallback automático).

alter table contratos add column if not exists ccd_firma_config jsonb default '{}'::jsonb;

create table if not exists ccd_formato_firma (
  id bigserial primary key,
  contrato_id bigint not null references contratos (id) on delete cascade,
  formato_codigo text not null,
  elaboro_nombre text,
  elaboro_cargo text,
  reviso_nombre text,
  reviso_cargo text,
  estilo_pdf jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (contrato_id, formato_codigo)
);

comment on column ccd_formato_firma.estilo_pdf is 'CCD: colores PDF por formato (barra sección, thead, filas, subtotal); merge con defaults en backend.';

create index if not exists idx_ccd_formato_firma_contrato on ccd_formato_firma (contrato_id);

comment on table ccd_formato_firma is 'CCD: quién elabora/revisa por formato; Aprobó sale del subcontratista en el PDF.';

-- Instalaciones que ya tenían la tabla sin estilo_pdf:
alter table ccd_formato_firma add column if not exists estilo_pdf jsonb default '{}'::jsonb;

-- Usuario elegido en Biblioteca CCD (además de nombre/cargo en texto); ver también backend/sql/ccd_corte_firma_registro.sql
alter table ccd_formato_firma add column if not exists elaboro_usuario_id bigint;
alter table ccd_formato_firma add column if not exists reviso_usuario_id bigint;

-- Aprobó (interventoría / formatos CC-SEM, CC-MES, etc.). Ejecutar también si ya tenías la tabla sin estas columnas.
alter table ccd_formato_firma add column if not exists aprobo_nombre text;
alter table ccd_formato_firma add column if not exists aprobo_cargo text;
alter table ccd_formato_firma add column if not exists aprobo_usuario_id bigint;

comment on column ccd_formato_firma.aprobo_usuario_id is 'CCD: responsable Aprobó (p. ej. interventoría) cuando aplica biblioteca.';
