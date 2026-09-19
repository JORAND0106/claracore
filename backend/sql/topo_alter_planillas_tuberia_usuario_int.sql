-- Hotfix: creado_por / usuario_id eran UUID pero ClaraCore usa usuarios.id INTEGER.
-- Corrige el 22P02 "invalid input syntax for type uuid: '3'" al crear planillas.
-- Seguro re-ejecutar.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'topo_planillas_tuberia'
      AND column_name = 'creado_por' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE topo_planillas_tuberia
      ALTER COLUMN creado_por TYPE INTEGER USING NULL,
      ALTER COLUMN cerrado_por TYPE INTEGER USING NULL,
      ALTER COLUMN validado_por TYPE INTEGER USING NULL,
      ALTER COLUMN reabierto_por TYPE INTEGER USING NULL,
      ALTER COLUMN validacion_revocada_por TYPE INTEGER USING NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'topo_planilla_tuberia_auditoria'
      AND column_name = 'usuario_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE topo_planilla_tuberia_auditoria
      ALTER COLUMN usuario_id TYPE INTEGER USING NULL;
  END IF;
END $$;
