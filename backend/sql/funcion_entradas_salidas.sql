-- ClaraCore — Función de permisos «Entradas y Salidas» (Almacén de Obra)
-- Independiente de «Almacén» (solicitudes/inventario) y «Catálogo de insumos».
-- Idempotente. Ejecutar en Supabase SQL Editor o vía /funciones (_ensure_funciones_requeridas).

INSERT INTO public.funciones (codigo, nombre, modulo)
VALUES ('ENTSAL', 'Entradas y Salidas', 'Obra')
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      modulo = EXCLUDED.modulo;

NOTIFY pgrst, 'reload schema';
