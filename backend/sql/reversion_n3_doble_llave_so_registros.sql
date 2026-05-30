-- Reversión del sellado en el NIVEL MÁXIMO activo del contrato (contrato_niveles_validacion).
-- Doble llave: (1) Nivel 2 — contratista / residente de costos; (2) validador de interventoría
-- con permiso en el nivel máximo (p. ej. N4 si el contrato sella en nivel4_estado).
-- Los nombres de columna reversion_arm_n3_* son legado: NO significan «nivel3_estado» del ítem.
-- Ejecutar en SQL Editor de Supabase (o psql) una vez antes de usar el flujo en API.
-- Después: también ejecutar alter_so_registro_comentarios_tipo_reversion_doble_llave.sql
-- y en Supabase → Settings → API → «Reload schema» (o: NOTIFY pgrst, 'reload schema';).

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS reversion_arm_n2_usuario_id bigint REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS reversion_arm_n3_usuario_id bigint REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.so_registros.reversion_arm_n2_usuario_id IS
  'Llave 1 reversión: usuario N2 (costos contratista) autorizó desbloquear sellado nivel máx.';
COMMENT ON COLUMN public.so_registros.reversion_arm_n3_usuario_id IS
  'Llave 2 reversión: usuario interventoría (perfil validación nivel máx. del contrato) autorizó';

-- Tipos de comentario para el flujo (obligatorio antes de usar la API):
-- backend/sql/alter_so_registro_comentarios_tipo_reversion_doble_llave.sql
