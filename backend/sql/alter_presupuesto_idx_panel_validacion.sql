-- Índice para agregado del panel de validación (contrato + tipo + vigente).
-- Ejecutar en Supabase después de presupuesto_panel_validacion_rpc.sql.

CREATE INDEX IF NOT EXISTS idx_presupuesto_panel_agg
  ON public.presupuesto (contrato_id, tipo_ejecucion, dado_de_baja);
