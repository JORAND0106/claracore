-- Asignación de subcontratista desde Presupuesto (edición masiva).
-- Idempotente. Conexión funcional completa con cortes/precios queda para un ajuste posterior.

ALTER TABLE public.presupuesto
  ADD COLUMN IF NOT EXISTS subcontratista_id integer
  REFERENCES public.subcontratistas(id) ON DELETE SET NULL;

ALTER TABLE public.presupuesto_version_items
  ADD COLUMN IF NOT EXISTS subcontratista_id integer
  REFERENCES public.subcontratistas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_presupuesto_subcontratista_id
  ON public.presupuesto (contrato_id, subcontratista_id)
  WHERE subcontratista_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presupuesto_version_items_subcontratista_id
  ON public.presupuesto_version_items (version_id, subcontratista_id)
  WHERE subcontratista_id IS NOT NULL;

COMMENT ON COLUMN public.presupuesto.subcontratista_id IS
  'Subcontratista asignado al registro (UI edición masiva). Uso operativo pleno en ajuste posterior.';

COMMENT ON COLUMN public.presupuesto_version_items.subcontratista_id IS
  'Copia / asignación de subcontratista en biblioteca de versión.';

-- Incluir subcontratista_id al congelar snapshot al sellar versión.
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

  DELETE FROM public.presupuesto_version_items WHERE version_id = p_version_id;

  INSERT INTO public.presupuesto_version_items (
    version_id, presupuesto_item_id_origen, contrato_id, pk_id, capitulo, competencia,
    item, descripcion, und, calzada, tramo, abs_inicio, abs_final, vlr_unitario,
    no_inicio, no_final, area_long_nod, ancho, espesor, cant_total, costo_directo,
    tipo_ejecucion, tipo_entidad, id_pol, observacion, revisado, observacion_externa,
    ent_handle, txt_handle, layer_ent, layer_txt, color_hex, guid, x_label, y_label,
    created_at, updated_at, rev_block_handle, dado_de_baja, sellado, validado_por,
    validado_en, pre_interv_estado, pre_interv_por, pre_interv_en, calculo_por, calculo_en,
    subcontratista_id
  )
  SELECT
    p_version_id, p.id, p.contrato_id, p.pk_id, p.capitulo, p.competencia,
    p.item, p.descripcion, p.und, p.calzada, p.tramo, p.abs_inicio, p.abs_final, p.vlr_unitario,
    p.no_inicio, p.no_final, p.area_long_nod, p.ancho, p.espesor, p.cant_total, p.costo_directo,
    p.tipo_ejecucion, p.tipo_entidad, p.id_pol, p.observacion, p.revisado, p.observacion_externa,
    p.ent_handle, p.txt_handle, p.layer_ent, p.layer_txt, p.color_hex, p.guid, p.x_label, p.y_label,
    p.created_at, p.updated_at, p.rev_block_handle, p.dado_de_baja, true, p.validado_por,
    p.validado_en, p.pre_interv_estado, p.pre_interv_por, p.pre_interv_en, p.calculo_por, p.calculo_en,
    p.subcontratista_id
  FROM public.presupuesto p
  WHERE p.contrato_id = p_contrato_id
    AND p.tipo_ejecucion = 'Presupuesto de Obra'
    AND COALESCE(p.dado_de_baja, false) = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.presupuesto_versiones
     SET es_vigente_aprobada = false
   WHERE contrato_id = p_contrato_id AND es_vigente_aprobada = true;

  UPDATE public.presupuesto_versiones
     SET estado = 'aprobado_sellado',
         sellado = true,
         es_vigente = false,
         es_vigente_aprobada = true,
         sellado_en = now(),
         sellado_por_interventoria = p_usuario_id,
         observaciones = COALESCE(NULLIF(trim(COALESCE(p_observaciones, '')), ''), observaciones)
   WHERE id = p_version_id AND contrato_id = p_contrato_id;

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
  'Llave 2 (interventoría): valida 100% aprobado, congela snapshot (incl. subcontratista_id), marca vigente aprobada y sella el vivo.';
