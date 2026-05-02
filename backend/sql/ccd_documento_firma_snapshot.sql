-- Snapshot inmutable de la configuración de firmantes en el momento que se registra
-- la primera firma de un documento. Garantiza que documentos firmados no cambien
-- su autoría si la biblioteca CCD es modificada posteriormente.
--
-- Ejecutar en Supabase → SQL Editor.

create table if not exists ccd_documento_firma_snapshot (
  id                  bigserial primary key,
  contrato_id         bigint not null references contratos(id) on delete cascade,
  formato_codigo      text   not null,

  -- Identificador del documento (exactamente uno de los dos grupos debe tener valor).
  -- Grupo A: cortes de subcontratista (ccd_corte_firma_registro).
  corte_id            bigint,
  -- Grupo B: contexto semana / acta_rpo (ccd_firma_registro).
  contexto_tipo       text,   -- 'semana' | 'acta_rpo'
  contexto_id         bigint,

  -- Snapshot de firmantes al momento de la primera firma.
  elaboro_nombre      text,
  elaboro_cargo       text,
  elaboro_usuario_id  bigint,
  elaboro2_nombre     text,
  elaboro2_cargo      text,
  elaboro2_usuario_id bigint,
  reviso_nombre       text,
  reviso_cargo        text,
  reviso_usuario_id   bigint,
  reviso2_nombre      text,
  reviso2_cargo       text,
  reviso2_usuario_id  bigint,
  aprobo_nombre       text,
  aprobo_cargo        text,
  aprobo_usuario_id   bigint,

  created_at          timestamptz default now()
);

-- Índice para lookup rápido por corte
create unique index if not exists idx_snap_corte
  on ccd_documento_firma_snapshot (contrato_id, formato_codigo, corte_id)
  where corte_id is not null;

-- Índice para lookup rápido por contexto
create unique index if not exists idx_snap_contexto
  on ccd_documento_firma_snapshot (contrato_id, formato_codigo, contexto_tipo, contexto_id)
  where contexto_tipo is not null and contexto_id is not null;

comment on table ccd_documento_firma_snapshot is
  'CCD: snapshot inmutable del config de firmantes al momento de la primera firma de un documento. '
  'Los PDFs firmados usarán este snapshot para preservar autoría aunque la biblioteca cambie.';
