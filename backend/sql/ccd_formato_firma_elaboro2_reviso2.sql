-- Columnas Elaboró 2 / Revisó 2 en biblioteca CCD (FO-IDU-EO-04-V2 y otros formatos con 4 firmantes).
-- Ejecutar en Supabase → SQL Editor.
-- Si PostgREST falla, el backend sigue guardando en contratos.ccd_firma_config (JSON fallback).

alter table ccd_formato_firma add column if not exists elaboro2_nombre    text;
alter table ccd_formato_firma add column if not exists elaboro2_cargo     text;
alter table ccd_formato_firma add column if not exists elaboro2_usuario_id bigint;
alter table ccd_formato_firma add column if not exists reviso2_nombre     text;
alter table ccd_formato_firma add column if not exists reviso2_cargo      text;
alter table ccd_formato_firma add column if not exists reviso2_usuario_id bigint;

comment on column ccd_formato_firma.elaboro2_nombre     is 'CCD: segundo firmante Elaboró (formatos con 4 firmas, p. ej. FO-IDU-EO-04-V2).';
comment on column ccd_formato_firma.elaboro2_usuario_id is 'CCD: usuario_id del segundo Elaboró.';
comment on column ccd_formato_firma.reviso2_nombre      is 'CCD: segundo firmante Revisó.';
comment on column ccd_formato_firma.reviso2_usuario_id  is 'CCD: usuario_id del segundo Revisó.';
