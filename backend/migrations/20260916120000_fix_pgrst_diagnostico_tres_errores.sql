-- =============================================================================
-- Fix PGRST diagnóstico (48h): tres errores recurrentes
--   1) PGRST203 — sobrecarga ambigua dashboard_matriz_validacion_vigente_bundle
--   2) PGRST204/42703 — falta columna periodo en notificaciones_email_resumen_snapshot
--   3) PGRST204 — columnas live de acta_grabacion_sesion (idempotente; ya pueden existir)
-- + índice parcial para GET /notificaciones/no-leidas-count
-- Idempotente. Tras aplicar: NOTIFY pgrst reload schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Error 1: eliminar sobrecarga obsoleta (bigint, text).
-- La versión vigente es solo (bigint). La de 2 args llama a
-- dashboard_matriz_validacion_agg(bigint,bigint,text) que NO existe → 42883.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_matriz_validacion_vigente_bundle(bigint, text);

-- Asegurar que la firma canónica (bigint) sigue existiendo.
-- Si ya está (migración 20260916010000 / sql/dashboard_matriz_validacion.sql),
-- CREATE OR REPLACE la deja intacta en comportamiento.
CREATE OR REPLACE FUNCTION public.dashboard_matriz_validacion_vigente_bundle(p_contrato_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $bundle$
DECLARE
  aid bigint;
  nr text;
  nom_asig text;
  mat jsonb;
BEGIN
  SELECT
    a.id,
    a.numero_rpo::text,
    trim(both FROM coalesce(u.nombre, '') || ' ' || coalesce(u.apellidos, ''))
  INTO aid, nr, nom_asig
  FROM public.actas a
  LEFT JOIN public.usuarios u ON u.id = a.asignado_a
  WHERE a.contrato_id = p_contrato_id
    AND a.tipo_grupo = 'RPO'
    AND a.fecha_inicio <= CURRENT_DATE
    AND a.fecha_fin >= CURRENT_DATE
  ORDER BY a.fecha_inicio DESC, a.numero_rpo DESC NULLS LAST, a.id DESC
  LIMIT 1;

  mat := public.dashboard_matriz_validacion_agg(p_contrato_id, aid);

  RETURN jsonb_build_object(
    'obra_ejecutada_directo_sin_aiu', mat->'obra_ejecutada_directo_sin_aiu',
    'ensayos_sondeos_directo_sin_iva', mat->'ensayos_sondeos_directo_sin_iva',
    '_vigente', jsonb_build_object(
      'acta_id', to_jsonb(aid),
      'numero_rpo', CASE WHEN nr IS NULL OR nr = '' THEN NULL::jsonb ELSE to_jsonb(nr) END,
      'asignado_nombre', to_jsonb(CASE WHEN nom_asig IS NULL OR trim(nom_asig) = '' THEN NULL ELSE trim(nom_asig) END),
      'filtro', to_jsonb(
        CASE WHEN aid IS NULL THEN 'sin_vigente_todo_contrato'::text ELSE 'vigente'::text END
      )
    )
  );
END;
$bundle$;

COMMENT ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint) IS
  'Matriz validación: acta RPO en período + agregación. Única firma (sin p_campo_nivel_max).';

GRANT EXECUTE ON FUNCTION public.dashboard_matriz_validacion_vigente_bundle(bigint)
  TO authenticated, service_role, anon;

-- -----------------------------------------------------------------------------
-- Error 2: columna periodo (apertura/cierre) en snapshots de correo
-- -----------------------------------------------------------------------------
ALTER TABLE public.notificaciones_email_resumen_snapshot
  ADD COLUMN IF NOT EXISTS periodo text NOT NULL DEFAULT 'apertura';

ALTER TABLE public.notificaciones_email_resumen_snapshot
  DROP CONSTRAINT IF EXISTS notificaciones_email_resumen_snapshot_unique;

ALTER TABLE public.notificaciones_email_resumen_snapshot
  ADD CONSTRAINT notificaciones_email_resumen_snapshot_unique
    UNIQUE (contrato_id, fecha, periodo);

COMMENT ON COLUMN public.notificaciones_email_resumen_snapshot.periodo IS
  'apertura (9:00) o cierre (18:00) de la jornada; usado por el informe semanal.';

-- -----------------------------------------------------------------------------
-- Error 3: columnas live de grabación de actas (idempotente)
-- -----------------------------------------------------------------------------
ALTER TABLE public.acta_grabacion_sesion
  ADD COLUMN IF NOT EXISTS transcripcion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS temas_propuestos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sintesis_en timestamptz,
  ADD COLUMN IF NOT EXISTS checkpoint_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temas_escucha_activa boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- Perf: conteo no leídas del buzón (filtro típico del endpoint)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notif_no_leidas_count
  ON public.notificaciones (destinatario_id, contrato_id)
  WHERE leido = false
    AND padre_id IS NULL
    AND COALESCE(oculto_destinatario, false) = false
    AND tipo IS DISTINCT FROM 'SOPORTE';

-- Recarga schema cache PostgREST
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
