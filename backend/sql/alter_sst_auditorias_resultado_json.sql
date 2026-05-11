-- ClaraCore — Auditor SST: persistir JSON completo del análisis (Anthropic).
-- Ejecutar en Supabase SQL Editor si la tabla ya existía sin esta columna.

ALTER TABLE public.sst_auditorias
  ADD COLUMN IF NOT EXISTS resultado_json jsonb;
