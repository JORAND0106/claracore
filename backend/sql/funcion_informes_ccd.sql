-- ── ClaraCore: función «Informes CCD» (permiso del módulo Informes en panel admin) ──
-- Si en producción no aparece la fila en Control de accesos, ejecuta este script
-- en Supabase → SQL Editor (rol con permiso INSERT en public.funciones).
--
-- Idempotente: no duplica si ya existe por nombre o por código.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'INFCCD', 'Informes CCD', 'Informes'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.funciones f
  WHERE lower(trim(f.nombre)) = 'informes ccd'
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'INFCCD')
);

-- Verificación:
-- SELECT id, codigo, nombre, modulo FROM public.funciones WHERE codigo = 'INFCCD' OR lower(nombre) = 'informes ccd';
