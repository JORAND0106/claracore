-- Habilitar tablas en la publicación supabase_realtime (ejecutar en SQL Editor tras deploy).
-- Si alguna ya está publicada, ignorar el error o usar IF NOT EXISTS según versión de Postgres.

ALTER PUBLICATION supabase_realtime ADD TABLE public.so_registros;
ALTER PUBLICATION supabase_realtime ADD TABLE public.so_reportes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presupuesto;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cad_queue;
-- Las MV (vm_sicoe_*) no pueden ir en la publicación; el cliente escucha tablas base.
-- Los triggers en vm_sicoe_realtime.sql refrescan las MV; el API lee desde las MV.
