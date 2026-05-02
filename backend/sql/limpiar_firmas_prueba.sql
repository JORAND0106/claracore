-- ⚠️  IRREVERSIBLE — borrar TODAS las firmas registradas en un contrato.
-- Usar solo para limpiar datos de prueba.
-- Reemplazar :contrato_id con el ID numérico del contrato.

-- 1. Firmas de contexto (semana / acta_rpo)
delete from ccd_firma_registro
where contrato_id = :contrato_id;

-- 2. Firmas de cortes de subcontratista
delete from ccd_corte_firma_registro
where contrato_id = :contrato_id;

-- 3. Snapshots de firmantes (tabla nueva)
delete from ccd_documento_firma_snapshot
where contrato_id = :contrato_id;

-- Para borrar de TODOS los contratos (entorno de desarrollo):
-- delete from ccd_firma_registro;
-- delete from ccd_corte_firma_registro;
-- delete from ccd_documento_firma_snapshot;
