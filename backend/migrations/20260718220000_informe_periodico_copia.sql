-- Registro servidor: copia informe periódico por ventana horaria

CREATE TABLE IF NOT EXISTS public.informe_periodico_copia (
  id           bigserial PRIMARY KEY,
  usuario_id   integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  contrato_id  integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  slot_id      text NOT NULL,
  slot_fecha   date NOT NULL,
  slot_hora    text NOT NULL,
  copiado_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT informe_periodico_copia_slot_id_fmt
    CHECK (slot_id ~ '^\d{4}-\d{2}-\d{2}_[0-9]{4}$'),
  CONSTRAINT informe_periodico_copia_usuario_contrato_slot_unique
    UNIQUE (usuario_id, contrato_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_informe_periodico_copia_slot
  ON public.informe_periodico_copia (contrato_id, slot_fecha, slot_hora);

CREATE INDEX IF NOT EXISTS idx_informe_periodico_copia_usuario
  ON public.informe_periodico_copia (usuario_id, copiado_at DESC);

COMMENT ON TABLE public.informe_periodico_copia IS
  'Copia del panel Validación por rol en recordatorio informe periódico; una fila por usuario/contrato/ventana horaria.';

COMMENT ON COLUMN public.informe_periodico_copia.slot_id IS
  'Identificador de ventana, p. ej. 2026-07-20_0800 (fecha local + clave horario).';

ALTER TABLE public.informe_periodico_copia ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
