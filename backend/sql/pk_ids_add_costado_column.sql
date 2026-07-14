-- Maestro PK-ID: columna COSTADO (presente en CSV, faltaba en tabla).
ALTER TABLE public.pk_ids ADD COLUMN IF NOT EXISTS costado text;
COMMENT ON COLUMN public.pk_ids.costado IS 'Costado (ej. oriental/occidental) desde CSV maestro PK-ID';
