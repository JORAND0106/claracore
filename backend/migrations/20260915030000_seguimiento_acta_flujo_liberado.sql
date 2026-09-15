-- Liberar el flujo secuencial en actas ya existentes (previas a esta regla).
-- El bloqueo Orden→Asistentes→Compromisos→Temas solo aplica al primer
-- diligenciamiento de actas nuevas; al llegar a Vista previa (o en legacy)
-- el documento queda en edición libre (flujo_tabs.liberado = true).
UPDATE public.seguimiento_acta
SET flujo_tabs = COALESCE(flujo_tabs, '{}'::jsonb) || '{"liberado": true}'::jsonb
WHERE COALESCE((flujo_tabs ->> 'liberado')::boolean, false) IS NOT TRUE;

COMMENT ON COLUMN public.seguimiento_acta.flujo_tabs IS
  'Progreso de pestañas: {orden, asistentes, compromisos, ideas, liberado}. '
  'liberado=true → edición libre (post Vista previa o acta legacy).';
