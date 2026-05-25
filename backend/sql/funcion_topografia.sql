-- ── ClaraCore: función «Topografía» (matriz Control de accesos) ──
-- Idempotente. Ejecutar en Supabase SQL Editor si GET /funciones no puede insertar (RLS).

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'TOPOGR', 'Topografía', 'Topografía'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.funciones f
  WHERE lower(trim(f.nombre)) IN ('topografía', 'topografia')
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'TOPOGR')
);
