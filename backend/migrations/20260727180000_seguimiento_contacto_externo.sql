-- Seguimiento: catálogo de contactos externos (asistentes recurrentes en actas).
-- Independiente de public.usuarios: sin login, roles ni acceso a la plataforma.

CREATE TABLE IF NOT EXISTS public.seguimiento_contacto_externo (
  id            bigserial PRIMARY KEY,
  contrato_id   integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  cargo         text,
  entidad       text,
  email         text,
  email_norm    text,
  activo        boolean NOT NULL DEFAULT true,
  usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_contacto_externo IS
  'Contactos externos de actas Seguimiento (sin acceso/login). Se inhabilitan al convertirse en usuario real (match por email).';

COMMENT ON COLUMN public.seguimiento_contacto_externo.email_norm IS
  'email en minúsculas y sin espacios; clave de coincidencia con usuarios.email';

COMMENT ON COLUMN public.seguimiento_contacto_externo.activo IS
  'false = inhabilitado (p. ej. ya existe como usuario de plataforma); no aparece en el buscador.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seg_contacto_ext_contrato_email
  ON public.seguimiento_contacto_externo (contrato_id, email_norm)
  WHERE email_norm IS NOT NULL AND email_norm <> '';

CREATE INDEX IF NOT EXISTS idx_seg_contacto_ext_contrato_activo
  ON public.seguimiento_contacto_externo (contrato_id)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_seg_contacto_ext_email_norm
  ON public.seguimiento_contacto_externo (email_norm)
  WHERE email_norm IS NOT NULL AND email_norm <> '';

NOTIFY pgrst, 'reload schema';
