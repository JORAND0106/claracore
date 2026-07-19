-- Notificaciones automáticas por correo: auditoría + funciones de conteo.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.notificaciones_email_envio (
  id            bigserial PRIMARY KEY,
  tipo          text NOT NULL,
  slot_key      text NOT NULL,
  usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  contrato_id   integer REFERENCES public.contratos(id) ON DELETE SET NULL,
  destinatario  text,
  exito         boolean NOT NULL DEFAULT false,
  error_detalle text,
  meta          jsonb,
  enviado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_email_envio_unique
    UNIQUE (tipo, slot_key, usuario_id, contrato_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_email_envio_tipo_slot
  ON public.notificaciones_email_envio (tipo, slot_key, enviado_at DESC);

COMMENT ON TABLE public.notificaciones_email_envio IS
  'Registro de envíos SMTP automáticos (informe, sin ítem, validación, admin). Evita duplicados por ventana.';

ALTER TABLE public.notificaciones_email_envio ENABLE ROW LEVEL SECURITY;

-- ── Conteo registros sin ítem ──
CREATE OR REPLACE FUNCTION public.notif_email_count_sin_item(p_contrato_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND (r.item_numero IS NULL OR btrim(r.item_numero) = '');
$$;

-- ── Conteo pendientes por validar en nivel N (con ítem y prerequisitos) ──
CREATE OR REPLACE FUNCTION public.notif_email_count_pendiente_nivel(
  p_contrato_id bigint,
  p_nivel int,
  p_niveles_activos bigint[] DEFAULT ARRAY[1, 2, 3]::bigint[]
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH na AS (
    SELECT array_agg(n ORDER BY n) AS arr
    FROM unnest(COALESCE(p_niveles_activos, ARRAY[1, 2, 3]::bigint[])) AS n
    WHERE n BETWEEN 1 AND 6
  )
  SELECT count(*)::bigint
  FROM public.so_registros r
  CROSS JOIN na
  WHERE r.contrato_id = p_contrato_id
    AND btrim(COALESCE(r.item_numero, '')) <> ''
    AND public._matriz_prereqs_ok(
      na.arr,
      p_nivel::smallint,
      public._norm_estado_matriz(r.nivel1_estado),
      public._norm_estado_matriz(r.nivel2_estado),
      public._norm_estado_matriz(r.nivel3_estado),
      public._norm_estado_matriz(r.nivel4_estado),
      public._norm_estado_matriz(r.nivel5_estado),
      public._norm_estado_matriz(r.nivel6_estado)
    )
    AND public._norm_estado_matriz(
      CASE p_nivel
        WHEN 1 THEN r.nivel1_estado
        WHEN 2 THEN r.nivel2_estado
        WHEN 3 THEN r.nivel3_estado
        WHEN 4 THEN r.nivel4_estado
        WHEN 5 THEN r.nivel5_estado
        WHEN 6 THEN r.nivel6_estado
        ELSE NULL
      END
    ) IN ('No Revisado', 'Pendiente');
$$;

-- ── Registros creados en un día (zona Bogotá) ──
CREATE OR REPLACE FUNCTION public.notif_email_registros_dia(
  p_contrato_id bigint,
  p_fecha date
)
RETURNS TABLE(n_reg bigint, total_valor numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*)::bigint,
    COALESCE(
      sum(public.dash_costo_agregado(r.cantidad_total, r.vlr_unitario)),
      0
    )::numeric
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND (r.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha;
$$;

-- ── Aprobados por nivel: del día (por fecha nivelN_fecha) y acumulado acta vigente ──
CREATE OR REPLACE FUNCTION public.notif_email_aprobados_nivel(
  p_contrato_id bigint,
  p_fecha date,
  p_acta_id bigint,
  p_nivel int
)
RETURNS TABLE(aprobado_dia bigint, aprobado_acum bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*) FILTER (
      WHERE public._norm_estado_matriz(
        CASE p_nivel
          WHEN 1 THEN r.nivel1_estado
          WHEN 2 THEN r.nivel2_estado
          WHEN 3 THEN r.nivel3_estado
          WHEN 4 THEN r.nivel4_estado
          WHEN 5 THEN r.nivel5_estado
          WHEN 6 THEN r.nivel6_estado
          ELSE NULL
        END
      ) = 'Aprobado'
        AND (
          CASE p_nivel
            WHEN 1 THEN r.nivel1_fecha
            WHEN 2 THEN r.nivel2_fecha
            WHEN 3 THEN r.nivel3_fecha
            WHEN 4 THEN r.nivel4_fecha
            WHEN 5 THEN r.nivel5_fecha
            WHEN 6 THEN r.nivel6_fecha
            ELSE NULL
          END
        ) IS NOT NULL
        AND (
          (
            CASE p_nivel
              WHEN 1 THEN r.nivel1_fecha
              WHEN 2 THEN r.nivel2_fecha
              WHEN 3 THEN r.nivel3_fecha
              WHEN 4 THEN r.nivel4_fecha
              WHEN 5 THEN r.nivel5_fecha
              WHEN 6 THEN r.nivel6_fecha
              ELSE NULL
            END
          ) AT TIME ZONE 'America/Bogota'
        )::date = p_fecha
    )::bigint,
    count(*) FILTER (
      WHERE public._norm_estado_matriz(
        CASE p_nivel
          WHEN 1 THEN r.nivel1_estado
          WHEN 2 THEN r.nivel2_estado
          WHEN 3 THEN r.nivel3_estado
          WHEN 4 THEN r.nivel4_estado
          WHEN 5 THEN r.nivel5_estado
          WHEN 6 THEN r.nivel6_estado
          ELSE NULL
        END
      ) = 'Aprobado'
        AND p_acta_id IS NOT NULL
        AND (
          r.acta_rpo_id = p_acta_id
          OR EXISTS (
            SELECT 1 FROM public.so_reportes rep
            WHERE rep.id = r.reporte_id AND rep.acta_rpo_id = p_acta_id
          )
        )
    )::bigint
  FROM public.so_registros r
  WHERE r.contrato_id = p_contrato_id
    AND btrim(COALESCE(r.item_numero, '')) <> '';
$$;

GRANT EXECUTE ON FUNCTION public.notif_email_count_sin_item(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_email_count_pendiente_nivel(bigint, int, bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_email_registros_dia(bigint, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_email_aprobados_nivel(bigint, date, bigint, int) TO service_role;

NOTIFY pgrst, 'reload schema';
