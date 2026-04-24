-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase Linter: "Security Definer View" (0010) — corrección
-- Documentación: https://supabase.com/docs/guides/database/database-advisors
--
-- Resumen: las vistas creadas sin security_invoker se ejecutan como el dueño
-- (equivalente a SECURITY DEFINER) y pueden **omitir RLS** frente a clientes
-- (anon/authenticated). No es, por sí sola, la causa de "unhealthy", pero
-- es un riesgo de fuga de datos y debe corregirse.
--
-- Requisito: PostgreSQL 15+ (Supabase lo cumple en proyectos recientes).
-- Tras aplicar, los avisos CRITICAL de ese tipo deberían desaparecer o reducirse
-- (verifica con Database → Advisors).
--
-- Si algún ALTER falla (vista inexistente o nombre distinto), comenta esa
-- línea o alinéala con el catálogo real:  SELECT * FROM pg_views WHERE schemaname='public';
-- ═══════════════════════════════════════════════════════════════════════════

-- Dashboard / presupuesto / drill (SICOE obra; nombres "cobro" suelen ser legado)
ALTER VIEW public.vista_dashboard_resumen        SET (security_invoker = true);
ALTER VIEW public.vista_dashboard_ppto_drill     SET (security_invoker = true);
ALTER VIEW public.vista_dashboard_drill_capitulo SET (security_invoker = true);
ALTER VIEW public.vista_dashboard_drill_item     SET (security_invoker = true);

ALTER VIEW public.vista_ppto_resumen       SET (security_invoker = true);
ALTER VIEW public.vista_ppto_por_capitulo  SET (security_invoker = true);

-- Vistas "cobro" (mismo criterio de negocio que obra: suelen leer so_registros + actas; nombre histórico)
ALTER VIEW public.vista_cobro_resumen            SET (security_invoker = true);
ALTER VIEW public.vista_cobro_por_capitulo      SET (security_invoker = true);
ALTER VIEW public.vista_cobro_por_capitulo_detalle SET (security_invoker = true);
ALTER VIEW public.vista_cobro_por_acta          SET (security_invoker = true);
ALTER VIEW public.vista_cobro_por_calzada       SET (security_invoker = true);

-- Matriz validación SICOE (definición fuente: dashboard_matriz_validacion.sql)
ALTER VIEW public.vista_so_registros_matriz_validacion SET (security_invoker = true);
