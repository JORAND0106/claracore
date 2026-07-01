-- ClaraCore — Códigos de activación ClaraCAD (instalador)
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS public.claracad_activaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo text NOT NULL,
  correo_destinatario text NOT NULL,
  generado_por_usuario_id bigint REFERENCES public.usuarios(id) ON DELETE SET NULL,
  generado_at timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL DEFAULT 'pendiente',
  activado_at timestamptz,
  ip_activacion text,
  equipo_info text,
  CONSTRAINT chk_claracad_activaciones_codigo_len CHECK (length(codigo) = 16),
  CONSTRAINT chk_claracad_activaciones_estado CHECK (estado IN ('pendiente', 'activo', 'revocado')),
  CONSTRAINT uq_claracad_activaciones_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_claracad_activaciones_correo_estado
  ON public.claracad_activaciones (lower(correo_destinatario), estado);

CREATE INDEX IF NOT EXISTS idx_claracad_activaciones_generado_at
  ON public.claracad_activaciones (generado_at DESC);

COMMENT ON TABLE public.claracad_activaciones IS
  'Códigos de activación únicos para el instalador ClaraCAD (SicoeCAD Agent).';
