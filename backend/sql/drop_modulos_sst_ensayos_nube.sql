-- ClaraCore — Eliminar módulos SST documental, Ensayos PIP e Integración nube
-- Ejecutar MANUALMENTE en Supabase SQL Editor ANTES de desplegar el frontend/backend actualizado.
--
-- CONSERVA tablas del módulo Auditor (IA):
--   public.sst_auditorias, public.sst_personal_importado, public.sst_personal
--
-- Tablas identificadas para eliminación (módulos retirados):
--   SST documental: sst_documentos, sst_plantillas_documentos, sst_maquinaria
--   Ensayos PIP:    ensayos_registros, ensayos_pip
--   Nube:           integraciones_nube
--   Alertas doc.:   alertas_documentos (creada para SST/Ensayos; sin uso en otros módulos)

BEGIN;

-- ── 1. Diagnóstico: tablas relacionadas que existen ─────────────────────────
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'integraciones_nube',
    'sst_plantillas_documentos',
    'sst_personal',
    'sst_maquinaria',
    'sst_documentos',
    'ensayos_pip',
    'ensayos_registros',
    'alertas_documentos',
    'sst_auditorias',
    'sst_personal_importado'
  )
ORDER BY table_name;

-- ── 2. Permisos asignados a funciones que se eliminarán ─────────────────────
SELECT f.id, f.codigo, f.nombre, COUNT(p.id) AS filas_permisos
FROM public.funciones f
LEFT JOIN public.permisos p ON p.funcion_id = f.id
WHERE lower(trim(f.nombre)) IN (
        'sst documental',
        'ensayos pip',
        'integración nube claracore'
      )
   OR upper(trim(f.codigo)) IN ('SSTDOC', 'ENSPIP', 'NUVECC')
GROUP BY f.id, f.codigo, f.nombre
ORDER BY f.nombre;

DELETE FROM public.permisos
WHERE funcion_id IN (
  SELECT id FROM public.funciones
  WHERE lower(trim(nombre)) IN (
          'sst documental',
          'ensayos pip',
          'integración nube claracore'
        )
     OR upper(trim(codigo)) IN ('SSTDOC', 'ENSPIP', 'NUVECC')
);

DELETE FROM public.funciones
WHERE lower(trim(nombre)) IN (
        'sst documental',
        'ensayos pip',
        'integración nube claracore'
      )
   OR upper(trim(codigo)) IN ('SSTDOC', 'ENSPIP', 'NUVECC');

-- ── 3. Eliminar tablas (orden por dependencias FK) ──────────────────────────
DROP TABLE IF EXISTS public.sst_documentos CASCADE;
DROP TABLE IF EXISTS public.ensayos_registros CASCADE;
DROP TABLE IF EXISTS public.sst_plantillas_documentos CASCADE;
DROP TABLE IF EXISTS public.sst_maquinaria CASCADE;
DROP TABLE IF EXISTS public.ensayos_pip CASCADE;
DROP TABLE IF EXISTS public.integraciones_nube CASCADE;
DROP TABLE IF EXISTS public.alertas_documentos CASCADE;

-- NOTA: sst_personal se conserva (roster opcional del Auditor IA).

COMMIT;

-- Refrescar caché de PostgREST si aplica:
-- NOTIFY pgrst, 'reload schema';
