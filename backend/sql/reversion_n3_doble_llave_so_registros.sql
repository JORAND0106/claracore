-- Reversión de aprobación N3 (Interventoría): doble consentimiento Nivel 2 + Nivel 3.
-- Ejecutar en SQL Editor de Supabase (o psql) una vez antes de usar el nuevo flujo en API.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS reversion_arm_n2_usuario_id bigint REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS reversion_arm_n3_usuario_id bigint REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.so_registros.reversion_arm_n2_usuario_id IS
  'Validador Nivel 2 que activó llave para reversión de N3 (pendiente contraparte)';
COMMENT ON COLUMN public.so_registros.reversion_arm_n3_usuario_id IS
  'Validador Nivel 3 que activó llave para reversión de aprobación N3 (pendiente contraparte)';
