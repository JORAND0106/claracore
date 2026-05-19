-- Índice para consultas de mapa / prog_obra por contrato + PK (presupuesto obra activo).
-- Idempotente.

CREATE INDEX IF NOT EXISTS idx_presupuesto_contrato_pk_obra
  ON public.presupuesto (contrato_id, pk_id)
  WHERE coalesce(dado_de_baja, false) = false
    AND trim(coalesce(tipo_ejecucion::text, '')) = 'Presupuesto de Obra';

COMMENT ON INDEX public.idx_presupuesto_contrato_pk_obra IS
  'Programación de obra: filtro presupuesto por contrato y PK sin escanear toda la tabla.';
