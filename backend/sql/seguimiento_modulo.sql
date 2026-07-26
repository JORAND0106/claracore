-- ClaraCore: función «Seguimiento» (matriz Control de accesos).
-- Idempotente. El esquema completo está en migrations/20260726000000_seguimiento_modulo.sql.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'SEGUIMIENTO', 'Seguimiento', 'Obra'
WHERE NOT EXISTS (
  SELECT 1 FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'seguimiento'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'SEGUIMIENTO')
);
