-- ClaraCore Documentación (CCD): configuración de firmas por contrato y código de formato.
-- Ejecutar en Supabase SQL Editor (una vez). El backend usa esta tabla si existe.
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
  updated_at timestamptz default now(),
  unique (contrato_id, formato_codigo)
);

create index if not exists idx_ccd_formato_firma_contrato on ccd_formato_firma (contrato_id);

comment on table ccd_formato_firma is 'CCD: quién elabora/revisa por formato; Aprobó sale del subcontratista en el PDF.';
