-- Validación previa a Interventoría (Residente de Costos u Residente de Obra).
-- NULL en pre_interv_estado = registros anteriores a esta columna (se tratan como liberados).

ALTER TABLE public.presupuesto ADD COLUMN IF NOT EXISTS pre_interv_estado text;
ALTER TABLE public.presupuesto ADD COLUMN IF NOT EXISTS pre_interv_por text;
ALTER TABLE public.presupuesto ADD COLUMN IF NOT EXISTS pre_interv_en timestamptz;

COMMENT ON COLUMN public.presupuesto.pre_interv_estado IS
  'Depuración contratista antes de Interventoría (No Revisado|Pendiente|Rechazado|Aprobado). NULL = legado.';
