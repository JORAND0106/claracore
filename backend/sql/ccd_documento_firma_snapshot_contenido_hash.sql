-- CCD: huella de contenido fuente al registrar la primera firma de un documento.
-- Se compara al generar el PDF; si difiere, los slots muestran texto de invalidación
-- (sin borrar registros de firma ni bloquear la descarga).

alter table ccd_documento_firma_snapshot
  add column if not exists contenido_hash text;

comment on column ccd_documento_firma_snapshot.contenido_hash is
  'SHA-256 hex del payload canónico del contenido fuente al momento de la primera firma. '
  'Null en firmas legacy (sin hash): no se invalida visualmente.';

select pg_notify('pgrst', 'reload schema');
