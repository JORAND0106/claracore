-- Vínculo usuario → subcontratista (Gestión de usuarios).
-- Idempotente: seguro re-ejecutar.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS subcontratista_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_subcontratista_id_fkey'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_subcontratista_id_fkey
      FOREIGN KEY (subcontratista_id)
      REFERENCES public.subcontratistas(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Tabla subcontratistas no existe aún; FK omitida.';
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_usuarios_subcontratista_id
  ON public.usuarios (subcontratista_id)
  WHERE subcontratista_id IS NOT NULL;

COMMENT ON COLUMN public.usuarios.subcontratista_id IS
  'FK al subcontratista del contrato cuando el cargo del usuario es Subcontratista. Un usuario ↔ un subcontratista.';
