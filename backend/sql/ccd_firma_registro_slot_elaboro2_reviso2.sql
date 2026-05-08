-- FO-IDU-EO-04-V2 usa cuatro slots en ccd_firma_registro: elaboro, elaboro2, reviso, reviso2.
-- La tabla original solo permitía elaboro | reviso | aprobo → insert con elaboro2/reviso2 fallaba (23514).
--
-- Ejecutar una vez en Supabase SQL Editor sobre el proyecto donde ya existe ccd_firma_registro.

ALTER TABLE ccd_firma_registro DROP CONSTRAINT IF EXISTS ccd_firma_registro_slot_check;

ALTER TABLE ccd_firma_registro ADD CONSTRAINT ccd_firma_registro_slot_check
  CHECK (slot IN ('elaboro', 'elaboro2', 'reviso', 'reviso2', 'aprobo'));

COMMENT ON CONSTRAINT ccd_firma_registro_slot_check ON ccd_firma_registro IS
  'Slots de firma CCD: tres originales más elaboro2/reviso2 para formatos de cuatro firmantes (FO-EO-04).';

SELECT pg_notify('pgrst', 'reload schema');
