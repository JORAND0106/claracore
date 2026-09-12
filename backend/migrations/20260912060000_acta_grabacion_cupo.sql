-- ClaraCore — Cupo diario de grabación de reuniones (Actas).
-- 180 minutos por contrato y día calendario America/Bogota.
-- Sin almacenamiento persistente de audio: solo consumo + auditoría de sesión.
-- Idempotente. Ejecutar en Supabase SQL Editor si el pipeline de migraciones no lo aplica.

CREATE TABLE IF NOT EXISTS public.acta_grabacion_cupo_diario (
  contrato_id         integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  fecha               date NOT NULL,
  segundos_consumidos integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id, fecha),
  CONSTRAINT chk_acta_grabacion_cupo_consumidos
    CHECK (segundos_consumidos >= 0)
);

CREATE INDEX IF NOT EXISTS idx_acta_grabacion_cupo_diario_fecha
  ON public.acta_grabacion_cupo_diario (fecha);

COMMENT ON TABLE public.acta_grabacion_cupo_diario IS
  'Segundos de grabación de actas consumidos por contrato y día (America/Bogota). Límite 180 min.';

CREATE TABLE IF NOT EXISTS public.acta_grabacion_sesion (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contrato_id         integer NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  usuario_id          integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fecha               date NOT NULL,
  iniciada_en         timestamptz NOT NULL DEFAULT now(),
  finalizada_en       timestamptz,
  ultimo_claim_en     timestamptz,
  segundos_consumidos integer NOT NULL DEFAULT 0,
  estado              text NOT NULL DEFAULT 'activa',
  motivo_cierre       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_acta_grabacion_sesion_segundos
    CHECK (segundos_consumidos >= 0),
  CONSTRAINT chk_acta_grabacion_sesion_estado
    CHECK (estado IN ('activa', 'finalizada', 'agotada', 'cancelada', 'abandonada'))
);

CREATE INDEX IF NOT EXISTS idx_acta_grabacion_sesion_contrato_fecha
  ON public.acta_grabacion_sesion (contrato_id, fecha);

CREATE INDEX IF NOT EXISTS idx_acta_grabacion_sesion_activa
  ON public.acta_grabacion_sesion (contrato_id, usuario_id)
  WHERE estado = 'activa';

COMMENT ON TABLE public.acta_grabacion_sesion IS
  'Auditoría mínima de sesiones de grabación de actas (sin audio).';

ALTER TABLE public.acta_grabacion_cupo_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acta_grabacion_sesion ENABLE ROW LEVEL SECURITY;

-- Claim atómico (permite claim parcial al agotar el cupo).
CREATE OR REPLACE FUNCTION public.acta_grabacion_claim_segundos(
  p_contrato_id integer,
  p_fecha date,
  p_segundos integer,
  p_limite integer DEFAULT 10800
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_limite integer := GREATEST(0, COALESCE(p_limite, 10800));
  v_pedir integer := GREATEST(0, COALESCE(p_segundos, 0));
  v_consumidos integer;
  v_claimed integer;
  v_restantes integer;
BEGIN
  IF p_contrato_id IS NULL OR p_contrato_id <= 0 THEN
    RAISE EXCEPTION 'contrato_id inválido';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha inválida';
  END IF;

  INSERT INTO public.acta_grabacion_cupo_diario (contrato_id, fecha, segundos_consumidos, updated_at)
  VALUES (p_contrato_id, p_fecha, 0, now())
  ON CONFLICT (contrato_id, fecha) DO NOTHING;

  SELECT segundos_consumidos
    INTO v_consumidos
  FROM public.acta_grabacion_cupo_diario
  WHERE contrato_id = p_contrato_id AND fecha = p_fecha
  FOR UPDATE;

  v_consumidos := COALESCE(v_consumidos, 0);
  v_restantes := GREATEST(0, v_limite - v_consumidos);
  v_claimed := LEAST(v_pedir, v_restantes);

  IF v_claimed > 0 THEN
    UPDATE public.acta_grabacion_cupo_diario
    SET segundos_consumidos = v_consumidos + v_claimed,
        updated_at = now()
    WHERE contrato_id = p_contrato_id AND fecha = p_fecha;
    v_consumidos := v_consumidos + v_claimed;
    v_restantes := GREATEST(0, v_limite - v_consumidos);
  END IF;

  RETURN jsonb_build_object(
    'ok', v_claimed > 0 OR v_pedir = 0,
    'claimed', v_claimed,
    'segundos_consumidos', v_consumidos,
    'segundos_restantes', v_restantes,
    'limite_segundos', v_limite,
    'fecha', p_fecha::text
  );
END;
$$;

COMMENT ON FUNCTION public.acta_grabacion_claim_segundos IS
  'Incrementa de forma atómica el cupo diario de grabación; permite claim parcial al llegar al límite.';

NOTIFY pgrst, 'reload schema';
