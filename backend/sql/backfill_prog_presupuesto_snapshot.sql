-- Programación de Obra — Backfill prog_presupuesto_snapshot en versiones selladas sin snapshot
-- REVISAR antes de ejecutar en Supabase.
--
-- Nota: regenera el snapshot desde el presupuesto VIVO actual. Solo es útil si el presupuesto
-- no cambió desde el sellado, o como aproximación para versiones selladas antes de Fase 3A.
-- Para contratos con otrosí posteriores al sellado, el delta puede ser impreciso.

DO $$
DECLARE
  r record;
  v_result jsonb;
BEGIN
  FOR r IN
    SELECT v.id AS version_id, v.contrato_id
    FROM public.prog_versiones v
    WHERE v.estado IN ('sellada', 'archivada')
      AND NOT EXISTS (
        SELECT 1 FROM public.prog_presupuesto_snapshot s
        WHERE s.version_id = v.id
      )
    ORDER BY v.contrato_id, v.numero_version
  LOOP
    BEGIN
      SELECT public.prog_snapshot_presupuesto(r.version_id, r.contrato_id) INTO v_result;
      RAISE NOTICE 'Snapshot backfill version % contrato %: %',
        r.version_id, r.contrato_id, v_result;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo backfill version %: %', r.version_id, SQLERRM;
    END;
  END LOOP;
END $$;
