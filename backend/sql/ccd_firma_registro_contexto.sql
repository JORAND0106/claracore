-- Firmas CCD por contexto (corte, semana de aprobación interventoría, acta RPO).
-- Escalable para CC-SEM-*, CC-MES-* sin acoplarse a subcontratista_cortes.
--
-- Ejecutar en Supabase SQL Editor (mismo proyecto que SUPABASE_URL del backend).
-- Si PostgREST devuelve PGRST205 "Could not find the table public.ccd_firma_registro":
--   1) Este script no se ha aplicado en ese proyecto (no confundir con ccd_corte_firma_registro).
--   2) Tras crear la tabla, ejecuta la línea NOTIFY al final para recargar el caché de esquema.
--   3) Si aún falla: Supabase Dashboard → Settings → API → reiniciar proyecto o esperar ~1 min.

create table if not exists ccd_firma_registro (
  id bigserial primary key,
  contrato_id bigint not null references contratos (id) on delete cascade,
  formato_codigo text not null,
  contexto_tipo text not null check (contexto_tipo in ('corte', 'semana', 'acta_rpo')),
  contexto_id bigint not null,
  slot text not null check (slot in ('elaboro', 'reviso', 'aprobo')),
  usuario_id bigint not null,
  firma_imagen_url text not null,
  created_at timestamptz not null default now(),
  unique (contrato_id, formato_codigo, contexto_tipo, contexto_id, slot)
);

create index if not exists idx_ccd_firma_reg_ctx on ccd_firma_registro (contexto_tipo, contexto_id);
create index if not exists idx_ccd_firma_reg_ctr on ccd_firma_registro (contrato_id);

comment on table ccd_firma_registro is 'CCD: firma registrada por slot (Elaboró/Revisó/Aprobó) y contexto (corte, semana so_semanas, acta actas).';

grant all on table ccd_firma_registro to postgres, service_role;
grant usage, select on sequence ccd_firma_registro_id_seq to service_role;

-- Recarga del caché de PostgREST (tabla nueva visible para la API).
select pg_notify('pgrst', 'reload schema');
