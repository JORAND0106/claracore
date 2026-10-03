-- Retira la biblioteca de bloques de nodo (reemplazada por la biblioteca de entidades del esquema).
-- Idempotente. Ejecutar en Supabase si ya se aplicó so_bloques_nodo.sql.

DROP TABLE IF EXISTS public.so_bloques_nodo CASCADE;
