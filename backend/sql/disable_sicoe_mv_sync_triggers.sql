-- ClaraCore — Desactivar refresco síncrono de MV en cada INSERT/UPDATE/DELETE SICOE.
-- Ejecutar en Supabase SQL Editor si asignar ítem / abrir reporte tarda minutos.
-- Script completo (índices + pg_cron): fix_performance_so_registros_fase1.sql

DROP TRIGGER IF EXISTS trg_refresh_dashboard ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_grilla_registros ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_registro_detalle ON public.so_registros;
DROP TRIGGER IF EXISTS trg_refresh_grilla_reportes ON public.so_reportes;

-- Verificación (debe devolver 0 filas):
-- SELECT c.relname, t.tgname FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname IN ('so_registros', 'so_reportes')
--   AND t.tgname LIKE 'trg_refresh%' AND NOT t.tgisinternal;
