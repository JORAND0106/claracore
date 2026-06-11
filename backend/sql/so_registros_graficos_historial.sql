-- Historial de gráficos por registro (plano automático + cargas manuales).
-- Ejecutar en SQL Editor de Supabase.

ALTER TABLE public.so_registros
  ADD COLUMN IF NOT EXISTS graficos_historial jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.so_registros.graficos_historial IS
  'Lista JSON [{url, numero, creado_en, origen}] de gráficos del registro; grafico_url es el activo/más reciente.';
