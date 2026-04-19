-- Columnas Aprobó (interventoría / responsable documental) en biblioteca CCD.
-- Opcional: si PostgREST falla, el backend sigue guardando en contratos.ccd_firma_config.

alter table ccd_formato_firma add column if not exists aprobo_nombre text;
alter table ccd_formato_firma add column if not exists aprobo_cargo text;
alter table ccd_formato_firma add column if not exists aprobo_usuario_id bigint;

comment on column ccd_formato_firma.aprobo_usuario_id is 'CCD: responsable Aprobó (p. ej. interventoría) en formatos CC-SEM / CC-MES.';
