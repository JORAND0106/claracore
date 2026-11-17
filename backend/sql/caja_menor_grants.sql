-- Caja Menor: el API usa el rol service_role.
-- Sin estos GRANT, PostgREST responde Not Found aunque las tablas ya existan.
-- Idempotente. Ejecutar en el editor SQL de Supabase y volver a abrir el módulo.

DO $$
DECLARE
  t text;
  s text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'caja_menor',
    'caja_menor_ingreso',
    'caja_menor_gasto',
    'caja_menor_tercero',
    'caja_menor_saldo_pendiente'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla public.% . Ejecute primero backend/sql/caja_menor_modulo.sql completo.', t;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      t
    );
  END LOOP;

  FOR s IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname LIKE 'caja_menor%'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
