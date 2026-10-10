-- Aparta el número de cada línea y después la mueve.
-- El índice único (solicitud_id, numero_linea) rechazaba el UPDATE directo
-- cuando el número nuevo todavía lo tenía otra línea del mismo lote.
-- Idempotente. La aplica schema_migrations_runner cuando existe SUPABASE_DB_URL.

CREATE OR REPLACE FUNCTION public.almacen_agrupar_mover_lineas(p_moves jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  m jsonb;
  n int;
  npark int := 1500000000;
  nuevo_solicitud bigint;
  item bigint;
BEGIN
  IF p_moves IS NULL OR jsonb_typeof(p_moves) <> 'array' THEN
    RAISE EXCEPTION 'No se recibieron las líneas a mover';
  END IF;

  FOR m IN SELECT value FROM jsonb_array_elements(p_moves)
  LOOP
    item := (m->>'item_id')::bigint;
    npark := npark + 1;
    UPDATE public.almacen_solicitud_item
       SET numero_linea = npark
     WHERE id = item;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'No se encontró la línea %', item;
    END IF;
  END LOOP;

  FOR m IN SELECT value FROM jsonb_array_elements(p_moves)
  LOOP
    item := (m->>'item_id')::bigint;
    nuevo_solicitud := (m->>'solicitud_id')::bigint;

    UPDATE public.almacen_solicitud_item
       SET solicitud_id = nuevo_solicitud,
           numero_linea = (m->>'numero_linea')::integer
     WHERE id = item;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'No se encontró la línea %', item;
    END IF;

    IF to_regclass('public.almacen_solicitud_mensaje') IS NOT NULL THEN
      UPDATE public.almacen_solicitud_mensaje
         SET solicitud_id = nuevo_solicitud
       WHERE solicitud_item_id = item;
    END IF;

    IF to_regclass('public.almacen_solicitud_mensaje_destinatario') IS NOT NULL
       AND to_regclass('public.almacen_solicitud_mensaje') IS NOT NULL THEN
      UPDATE public.almacen_solicitud_mensaje_destinatario d
         SET solicitud_id = nuevo_solicitud
        FROM public.almacen_solicitud_mensaje msg
       WHERE msg.id = d.mensaje_id
         AND msg.solicitud_item_id = item;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.almacen_agrupar_mover_lineas(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.almacen_agrupar_mover_lineas(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
