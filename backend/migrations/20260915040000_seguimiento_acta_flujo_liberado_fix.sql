-- Reafirma liberación de actas legacy y asegura columna flujo_tabs.
-- Idempotente: actas sin versión de flujo (previas al secuencial) → liberado.

ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS flujo_tabs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1) Cualquier fila aún en {} o sin liberado/v/hitos → liberado
UPDATE public.seguimiento_acta
SET flujo_tabs = COALESCE(flujo_tabs, '{}'::jsonb) || jsonb_build_object('liberado', true)
WHERE
  flujo_tabs IS NULL
  OR flujo_tabs = '{}'::jsonb
  OR (
    COALESCE((flujo_tabs ->> 'liberado')::boolean, false) IS NOT TRUE
    AND COALESCE(flujo_tabs ->> 'v', '') = ''
    AND COALESCE((flujo_tabs ->> 'orden')::boolean, false) IS NOT TRUE
    AND COALESCE((flujo_tabs ->> 'asistentes')::boolean, false) IS NOT TRUE
    AND COALESCE((flujo_tabs ->> 'compromisos')::boolean, false) IS NOT TRUE
    AND COALESCE((flujo_tabs ->> 'ideas')::boolean, false) IS NOT TRUE
  );

COMMENT ON COLUMN public.seguimiento_acta.flujo_tabs IS
  'Progreso de pestañas: {v, orden, asistentes, compromisos, ideas, liberado}. '
  'v>=1 = acta bajo flujo secuencial. Sin v / {} = legacy liberado. '
  'liberado=true → edición libre (post Vista previa o acta existente).';
