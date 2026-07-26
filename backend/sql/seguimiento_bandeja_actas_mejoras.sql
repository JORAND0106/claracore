-- Extensión Seguimiento bandeja/actas (ver migrations/20260726140000_seguimiento_bandeja_actas_mejoras.sql).

ALTER TABLE public.seguimiento_item
  ADD COLUMN IF NOT EXISTS hora_vencimiento text,
  ADD COLUMN IF NOT EXISTS consecutivo integer,
  ADD COLUMN IF NOT EXISTS referido_a_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referido_a_nombre text,
  ADD COLUMN IF NOT EXISTS relacion_destinatario text;

ALTER TABLE public.seguimiento_acta_asistente
  ADD COLUMN IF NOT EXISTS email text;

NOTIFY pgrst, 'reload schema';
