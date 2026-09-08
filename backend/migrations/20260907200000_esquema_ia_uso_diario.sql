-- Cupo diario de «Dibujar con IA» por usuario (20 consultas/día, zona Bogotá).
-- Reemplaza el conteo por documento/registro de esquema_ia_uso.

CREATE TABLE IF NOT EXISTS public.esquema_ia_uso_diario (
  usuario_id  integer NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  conteo      integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, fecha),
  CONSTRAINT chk_esquema_ia_uso_diario_conteo CHECK (conteo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_esquema_ia_uso_diario_fecha
  ON public.esquema_ia_uso_diario (fecha);

COMMENT ON TABLE public.esquema_ia_uso_diario IS
  'Consultas de Dibujar con IA por usuario y día calendario (America/Bogota). Máx. 20. Se reinicia al cambiar la fecha.';

ALTER TABLE public.esquema_ia_uso_diario ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.esquema_ia_uso IS
  'LEGACY: cupo por documento (ya no se usa). El cupo vigente está en esquema_ia_uso_diario.';
