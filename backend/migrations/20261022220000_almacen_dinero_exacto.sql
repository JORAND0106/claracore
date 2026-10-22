-- El dinero de Almacén deja de guardarse forzado a 2 decimales.
-- Ampliar numeric(18,2) a numeric no cambia los valores ya guardados.
-- No reescribe órdenes de compra emitidas ni solicitudes.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name LIKE 'almacen%'
      AND c.data_type = 'numeric'
      AND c.numeric_scale = 2
      AND c.column_name NOT ILIKE 'abscisa%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric USING %I::numeric',
      r.table_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;
