-- Pie de foto manual del grupo de gráfico (reemplaza el caption automático).
ALTER TABLE public.presupuesto_grafico_grupos
  ADD COLUMN IF NOT EXISTS pie_foto text;

COMMENT ON COLUMN public.presupuesto_grafico_grupos.pie_foto IS
  'Pie de foto corto redactado por el usuario; obligatorio al crear/actualizar el gráfico.';

NOTIFY pgrst, 'reload schema';
