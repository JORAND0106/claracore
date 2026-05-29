-- Permite comentarios de reversión en doble llave (llave N2 + llave interventoría / nivel máx.).
-- Ejecutar en SQL Editor de Supabase antes de usar el flujo en producción.
-- Error sin esto: violates check constraint "so_registro_comentarios_tipo_check"

ALTER TABLE public.so_registro_comentarios
  DROP CONSTRAINT IF EXISTS so_registro_comentarios_tipo_check;

DO $$
DECLARE
  tipos_existentes text[];
  tipos_nuevos text[] := ARRAY[
    'validacion',
    'solicitud_reversion',
    'aceptar_reversion',
    'reversion_doble_llave',
    'reversion_doble_llave_n2',
    'reversion_doble_llave_n3'
  ];
  tipos_todos text[];
  chk_sql text;
BEGIN
  SELECT coalesce(array_agg(DISTINCT tipo ORDER BY tipo), ARRAY[]::text[])
    INTO tipos_existentes
    FROM public.so_registro_comentarios
    WHERE tipo IS NOT NULL AND btrim(tipo) <> '';

  SELECT array_agg(DISTINCT x ORDER BY x)
    INTO tipos_todos
    FROM (
      SELECT unnest(tipos_existentes) AS x
      UNION
      SELECT unnest(tipos_nuevos) AS x
    ) u;

  chk_sql := format(
    'ALTER TABLE public.so_registro_comentarios ADD CONSTRAINT so_registro_comentarios_tipo_check CHECK (tipo IS NULL OR tipo IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ') FROM unnest(tipos_todos) AS t)
  );

  EXECUTE chk_sql;
END $$;

COMMENT ON CONSTRAINT so_registro_comentarios_tipo_check ON public.so_registro_comentarios IS
  'Tipos de comentario SICOE; incluye reversion_doble_llave_n2/n3 para doble autorización.';
