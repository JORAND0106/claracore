-- ── ClaraCore: función «Programación de obra» (matriz Control de accesos) ──
-- Idempotente. Ejecutar en Supabase SQL Editor si GET /funciones no puede insertar (RLS).

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'PROGOB', 'Programación de obra', 'Programación'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'programación de obra'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'PROGOB')
);
