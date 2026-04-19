-- Firmas registradas por corte + formato CCD (Elaboró / Revisó).
-- Ejecutar en Supabase si usas el flujo de «registrar firma» y PDF con firmas acumuladas.

create table if not exists ccd_corte_firma_registro (
  id bigserial primary key,
  contrato_id bigint not null references contratos (id) on delete cascade,
  corte_id bigint not null references subcontratista_cortes (id) on delete cascade,
  formato_codigo text not null,
  slot text not null check (slot in ('elaboro', 'reviso')),
  usuario_id bigint not null,
  firma_imagen_url text not null,
  created_at timestamptz not null default now(),
  unique (corte_id, formato_codigo, slot)
);

create index if not exists idx_ccd_corte_firma_corte on ccd_corte_firma_registro (corte_id);
create index if not exists idx_ccd_corte_firma_contrato on ccd_corte_firma_registro (contrato_id);

comment on table ccd_corte_firma_registro is 'CCD: URL de imagen de firma registrada por slot al firmar un informe de corte.';

-- IDs de usuario elegidos en Biblioteca CCD (persistidos junto a nombre/cargo).
alter table ccd_formato_firma add column if not exists elaboro_usuario_id bigint;
alter table ccd_formato_firma add column if not exists reviso_usuario_id bigint;
