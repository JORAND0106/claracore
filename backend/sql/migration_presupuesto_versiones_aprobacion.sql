-- ═══════════════════════════════════════════════════════════════════════════
-- ClaraCore — Versionador de presupuesto: ciclo de aprobación con DOBLE LLAVE
-- (contratista + interventoría)
--
-- Modelo:
--   • presupuesto (vivo)          = borrador de trabajo editable.
--   • presupuesto_version_items   = snapshot INMUTABLE de una versión sellada.
--   • es_vigente (existente)      = "borrador activo" ligado al presupuesto vivo.
--   • es_vigente_aprobada (nuevo) = ÚLTIMA versión sellada → alimenta dashboard
--                                   y programación. Una sola por contrato.
--
-- Flujo:
--   1) Contratista crea/edita el borrador (estado='borrador').
--   2) Contratista "Enviar a interventoría"  → llave 1 (estado='enviado_interventoria').
--   3) Interventoría "Aprobar y sellar"      → llave 2 (estado='aprobado_sellado'):
--        congela snapshot del vivo, marca es_vigente_aprobada, sella el vivo.
--   4) Contratista "Crear nueva versión"     → des-sella el vivo (editable),
--        conserva revisado='Aprobado' (al editar vuelve a 'No Revisado').
--
-- Ejecutar en Supabase SQL Editor (idempotente). Pensado para validar en RAMA.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Columnas del ciclo de aprobación ──────────────────────────────────────

ALTER TABLE public.presupuesto_versiones
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS sellado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_vigente_aprobada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enviado_en timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_por integer REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS sellado_en timestamptz,
  ADD COLUMN IF NOT EXISTS sellado_por_contratista integer REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS sellado_por_interventoria integer REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS observaciones text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_presupuesto_version_estado'
  ) THEN
    ALTER TABLE public.presupuesto_versiones
      ADD CONSTRAINT chk_presupuesto_version_estado
      CHECK (estado IN ('borrador', 'enviado_interventoria', 'aprobado_sellado', 'rechazado'));
  END IF;
END$$;

-- Backfill de datos existentes (modelo anterior "vigente = vivo"):
--   • la vigente actual pasa a ser el borrador activo;
--   • las no vigentes eran snapshots congelados → quedan como selladas.
-- No marcamos es_vigente_aprobada en ninguna: así dashboard/programación
-- siguen leyendo el vivo (fallback) hasta el primer sello real. Sin regresión.
UPDATE public.presupuesto_versiones
   SET estado = CASE WHEN es_vigente THEN 'borrador' ELSE 'aprobado_sellado' END,
       sellado = CASE WHEN es_vigente THEN false ELSE true END
 WHERE estado IS NULL OR estado = 'borrador';

-- Una sola "vigente aprobada" (última sellada) por contrato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuesto_version_vigente_aprobada
  ON public.presupuesto_versiones (contrato_id)
  WHERE es_vigente_aprobada = true;

CREATE INDEX IF NOT EXISTS idx_presupuesto_versiones_estado
  ON public.presupuesto_versiones (contrato_id, estado);

COMMENT ON COLUMN public.presupuesto_versiones.estado IS
  'Ciclo doble llave: borrador | enviado_interventoria | aprobado_sellado | rechazado.';
COMMENT ON COLUMN public.presupuesto_versiones.es_vigente_aprobada IS
  'Última versión sellada y vigente; fuente OFICIAL de dashboard y programación.';

-- ── 2) RPC: enviar a interventoría (LLAVE 1 — contratista) ───────────────────

CREATE OR REPLACE FUNCTION public.presupuesto_version_enviar_interventoria(
  p_contrato_id integer,
  p_version_id uuid,
  p_usuario_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_estado text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  SELECT estado INTO v_estado
  FROM public.presupuesto_versiones
  WHERE id = p_version_id AND contrato_id = p_contrato_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'presupuesto_version_enviar_interventoria: versión no encontrada para el contrato'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado NOT IN ('borrador', 'rechazado') THEN
    RAISE EXCEPTION 'Solo un borrador puede enviarse a interventoría (estado actual: %)', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.presupuesto_versiones
     SET estado = 'enviado_interventoria',
         enviado_en = now(),
         enviado_por = p_usuario_id,
         sellado_por_contratista = p_usuario_id
   WHERE id = p_version_id AND contrato_id = p_contrato_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'estado', 'enviado_interventoria');
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_enviar_interventoria(integer, uuid, integer) IS
  'Llave 1 (contratista): marca la versión borrador como enviada a interventoría y bloquea su edición.';

-- ── 3) RPC: rechazar / devolver (interventoría) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.presupuesto_version_rechazar(
  p_contrato_id integer,
  p_version_id uuid,
  p_usuario_id integer,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_estado text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  SELECT estado INTO v_estado
  FROM public.presupuesto_versiones
  WHERE id = p_version_id AND contrato_id = p_contrato_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'presupuesto_version_rechazar: versión no encontrada para el contrato'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado <> 'enviado_interventoria' THEN
    RAISE EXCEPTION 'Solo una versión enviada a interventoría puede rechazarse (estado actual: %)', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.presupuesto_versiones
     SET estado = 'borrador',
         enviado_en = NULL,
         enviado_por = NULL,
         observaciones = NULLIF(trim(COALESCE(p_observaciones, '')), '')
   WHERE id = p_version_id AND contrato_id = p_contrato_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'estado', 'borrador');
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_rechazar(integer, uuid, integer, text) IS
  'Interventoría devuelve la versión a borrador editable con observaciones (no sella).';

-- ── 4) RPC: aprobar y sellar (LLAVE 2 — interventoría) ───────────────────────
--   Congela el snapshot del presupuesto vivo, marca la versión como sellada y
--   vigente aprobada (única), y sella el vivo (sellado=true) para impedir edición.

CREATE OR REPLACE FUNCTION public.presupuesto_version_sellar(
  p_contrato_id integer,
  p_version_id uuid,
  p_usuario_id integer,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_estado text;
  v_pendientes bigint;
  v_count bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  SELECT estado INTO v_estado
  FROM public.presupuesto_versiones
  WHERE id = p_version_id AND contrato_id = p_contrato_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'presupuesto_version_sellar: versión no encontrada para el contrato'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado <> 'enviado_interventoria' THEN
    RAISE EXCEPTION 'La versión debe estar enviada a interventoría (llave del contratista) antes de sellar (estado: %)', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Doble validación: el presupuesto debe estar 100%% aprobado.
  SELECT count(*) INTO v_pendientes
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND p.tipo_ejecucion = 'Presupuesto de Obra'
    AND COALESCE(p.dado_de_baja, false) = false
    AND COALESCE(p.revisado, 'No Revisado') <> 'Aprobado';

  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'No se puede sellar: % registro(s) sin aprobar. El presupuesto debe estar 100%% aprobado.', v_pendientes
      USING ERRCODE = 'check_violation';
  END IF;

  -- Congelar snapshot inmutable desde el vivo (reemplaza cualquier ítem previo).
  DELETE FROM public.presupuesto_version_items WHERE version_id = p_version_id;

  INSERT INTO public.presupuesto_version_items (
    version_id, presupuesto_item_id_origen, contrato_id, pk_id, capitulo, competencia,
    item, descripcion, und, calzada, tramo, abs_inicio, abs_final, vlr_unitario,
    no_inicio, no_final, area_long_nod, ancho, espesor, cant_total, costo_directo,
    tipo_ejecucion, tipo_entidad, id_pol, observacion, revisado, observacion_externa,
    ent_handle, txt_handle, layer_ent, layer_txt, color_hex, guid, x_label, y_label,
    created_at, updated_at, rev_block_handle, dado_de_baja, sellado, validado_por,
    validado_en, pre_interv_estado, pre_interv_por, pre_interv_en, calculo_por, calculo_en
  )
  SELECT
    p_version_id, p.id, p.contrato_id, p.pk_id, p.capitulo, p.competencia,
    p.item, p.descripcion, p.und, p.calzada, p.tramo, p.abs_inicio, p.abs_final, p.vlr_unitario,
    p.no_inicio, p.no_final, p.area_long_nod, p.ancho, p.espesor, p.cant_total, p.costo_directo,
    p.tipo_ejecucion, p.tipo_entidad, p.id_pol, p.observacion, p.revisado, p.observacion_externa,
    p.ent_handle, p.txt_handle, p.layer_ent, p.layer_txt, p.color_hex, p.guid, p.x_label, p.y_label,
    p.created_at, p.updated_at, p.rev_block_handle, p.dado_de_baja, true, p.validado_por,
    p.validado_en, p.pre_interv_estado, p.pre_interv_por, p.pre_interv_en, p.calculo_por, p.calculo_en
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND p.tipo_ejecucion = 'Presupuesto de Obra'
    AND COALESCE(p.dado_de_baja, false) = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Única vigente aprobada.
  UPDATE public.presupuesto_versiones
     SET es_vigente_aprobada = false
   WHERE contrato_id = p_contrato_id AND es_vigente_aprobada = true;

  UPDATE public.presupuesto_versiones
     SET estado = 'aprobado_sellado',
         sellado = true,
         es_vigente = false,            -- ya no es el borrador activo; lee su snapshot
         es_vigente_aprobada = true,
         sellado_en = now(),
         sellado_por_interventoria = p_usuario_id,
         observaciones = COALESCE(NULLIF(trim(COALESCE(p_observaciones, '')), ''), observaciones)
   WHERE id = p_version_id AND contrato_id = p_contrato_id;

  -- Sellar el vivo: queda bloqueado para edición hasta crear una nueva versión.
  UPDATE public.presupuesto
     SET sellado = true
   WHERE contrato_id = p_contrato_id
     AND tipo_ejecucion = 'Presupuesto de Obra'
     AND COALESCE(dado_de_baja, false) = false;

  RETURN jsonb_build_object(
    'ok', true,
    'version_id', p_version_id,
    'estado', 'aprobado_sellado',
    'items_sellados', v_count
  );
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_sellar(integer, uuid, integer, text) IS
  'Llave 2 (interventoría): valida 100%% aprobado, congela snapshot, marca vigente aprobada y sella el vivo.';

-- ── 5) RPC: crear nueva versión borrador (contratista) ───────────────────────
--   Tras un sello, el vivo ya equivale a la última aprobada. Crear versión =
--   registrar el borrador y DES-SELLAR el vivo (editable), conservando revisado.

CREATE OR REPLACE FUNCTION public.presupuesto_version_crear_borrador(
  p_contrato_id integer,
  p_etiqueta text,
  p_justificacion_tecnica text,
  p_creada_por integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_numero integer;
  v_borrador_activo uuid;
  v_snapshot text;
BEGIN
  IF p_contrato_id IS NULL OR p_creada_por IS NULL THEN
    RAISE EXCEPTION 'presupuesto_version_crear_borrador: contrato_id y creada_por obligatorios'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_etiqueta IS NULL OR length(trim(p_etiqueta)) = 0 THEN
    RAISE EXCEPTION 'presupuesto_version_crear_borrador: etiqueta obligatoria'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('presupuesto_versiones'), p_contrato_id);

  -- No permitir dos borradores activos a la vez: el anterior debe estar sellado.
  SELECT id INTO v_borrador_activo
  FROM public.presupuesto_versiones
  WHERE contrato_id = p_contrato_id AND es_vigente = true
  LIMIT 1;

  IF v_borrador_activo IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe un borrador activo; séllelo (apruébelo) antes de crear una nueva versión.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(MAX(numero_version), 0) + 1 INTO v_numero
  FROM public.presupuesto_versiones
  WHERE contrato_id = p_contrato_id;

  v_snapshot := CASE WHEN v_numero = 1 THEN 'inicial' ELSE 'completo' END;
  v_id := gen_random_uuid();

  INSERT INTO public.presupuesto_versiones (
    id, contrato_id, numero_version, etiqueta, es_vigente, justificacion_tecnica,
    creada_por, creada_en, snapshot_tipo, estado, sellado, es_vigente_aprobada
  ) VALUES (
    v_id, p_contrato_id, v_numero, trim(p_etiqueta), true,
    NULLIF(trim(COALESCE(p_justificacion_tecnica, '')), ''),
    p_creada_por, now(), v_snapshot, 'borrador', false, false
  );

  -- Des-sellar el vivo para que el contratista pueda editar/eliminar/agregar.
  -- Se conserva 'revisado' (las copiadas siguen Aprobado; al editar vuelven a No Revisado).
  UPDATE public.presupuesto
     SET sellado = false
   WHERE contrato_id = p_contrato_id
     AND tipo_ejecucion = 'Presupuesto de Obra'
     AND COALESCE(dado_de_baja, false) = false;

  RETURN jsonb_build_object(
    'ok', true,
    'version_id', v_id,
    'numero_version', v_numero,
    'snapshot_tipo', v_snapshot,
    'estado', 'borrador'
  );
END;
$function$;

COMMENT ON FUNCTION public.presupuesto_version_crear_borrador(integer, text, text, integer) IS
  'Crea una nueva versión borrador (es_vigente) y des-sella el presupuesto vivo para edición.';

-- ── 6) Vista de la versión OFICIAL vigente (sellada) por contrato ────────────
--   Dashboard y programación leen de aquí. Si no hay versión sellada todavía,
--   no devuelve filas → los consumidores hacen fallback al presupuesto vivo.

CREATE OR REPLACE VIEW public.presupuesto_vigente_aprobada AS
SELECT pvi.*, pv.numero_version AS version_numero, pv.id AS version_id_ref
FROM public.presupuesto_version_items pvi
JOIN public.presupuesto_versiones pv
  ON pv.id = pvi.version_id
WHERE pv.es_vigente_aprobada = true;

COMMENT ON VIEW public.presupuesto_vigente_aprobada IS
  'Filas de la última versión sellada (es_vigente_aprobada) por contrato; fuente oficial de dashboard/programación.';
