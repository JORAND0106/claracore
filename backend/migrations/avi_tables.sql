-- ═══════════════════════════════════════════════════════════════════════════
-- ClaraCore — AVI (Asistente Virtual Inteligente)
-- Tablas: avi_uso_diario, avi_conversaciones
--
-- Ejecutar en Supabase SQL Editor (una sola vez). Idempotente.
-- Requisito: PostgreSQL 15+ (Supabase estándar lo cumple).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Límite diario de mensajes por usuario ─────────────────────────────────
--
-- usuario_id es el `sub` del JWT (string); no referencia usuarios(id) porque
-- es un texto proveniente del token, más barato de leer en cada petición.
-- El upsert atómico (INSERT ... ON CONFLICT DO UPDATE) garantiza consistencia
-- sin transacciones explícitas ni condiciones de carrera.

CREATE TABLE IF NOT EXISTS public.avi_uso_diario (
    usuario_id  TEXT        NOT NULL,
    fecha       DATE        NOT NULL DEFAULT CURRENT_DATE,
    conteo      INTEGER     NOT NULL DEFAULT 1,
    PRIMARY KEY (usuario_id, fecha)
);

COMMENT ON TABLE  public.avi_uso_diario             IS 'Contador diario de mensajes AVI por usuario. Un registro por (usuario, día). Resetea implícitamente al cambiar la fecha.';
COMMENT ON COLUMN public.avi_uso_diario.usuario_id  IS 'sub del JWT ClaraCore (equivale al id de usuarios, como texto).';
COMMENT ON COLUMN public.avi_uso_diario.fecha       IS 'Fecha calendario (sin hora) en UTC; la comparación en el backend usa date.today().';
COMMENT ON COLUMN public.avi_uso_diario.conteo      IS 'Mensajes enviados hoy. El upsert hace conteo = conteo + 1 atómicamente.';

-- Índice de soporte para barridos de limpieza (borrar filas antiguas por fecha).
CREATE INDEX IF NOT EXISTS idx_avi_uso_diario_fecha
    ON public.avi_uso_diario (fecha);


-- ── 2. Conversaciones AVI (log para futuro módulo FAQ) ───────────────────────
--
-- El insert es asíncrono y best-effort: si falla no afecta al usuario.
-- marcada_faq / aprobada / veces_repetida alimentarán el panel FAQ en el futuro.

CREATE TABLE IF NOT EXISTS public.avi_conversaciones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      TEXT        NOT NULL,
    modulo          TEXT,
    pregunta        TEXT        NOT NULL,
    respuesta       TEXT        NOT NULL,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tiene_imagen    BOOLEAN     NOT NULL DEFAULT FALSE,
    marcada_faq     BOOLEAN     NOT NULL DEFAULT FALSE,
    aprobada        BOOLEAN     NOT NULL DEFAULT FALSE,
    veces_repetida  INTEGER     NOT NULL DEFAULT 1,
    tokens_input    INTEGER     NOT NULL DEFAULT 0,
    tokens_output   INTEGER     NOT NULL DEFAULT 0
);

COMMENT ON TABLE  public.avi_conversaciones               IS 'Historial de conversaciones AVI. Uso principal: curación de FAQ. El insert es asíncrono (no bloquea la respuesta al usuario).';
COMMENT ON COLUMN public.avi_conversaciones.usuario_id    IS 'sub del JWT; no FK para no acoplar a la tabla usuarios.';
COMMENT ON COLUMN public.avi_conversaciones.modulo        IS 'Slug normalizado del módulo activo al momento de la pregunta.';
COMMENT ON COLUMN public.avi_conversaciones.marcada_faq   IS 'Un admin marcó esta entrada como candidata a FAQ.';
COMMENT ON COLUMN public.avi_conversaciones.aprobada      IS 'FAQ aprobada y lista para publicar.';
COMMENT ON COLUMN public.avi_conversaciones.veces_repetida IS 'Cuántas veces se hizo la misma pregunta (para priorizar FAQ).';
COMMENT ON COLUMN public.avi_conversaciones.tokens_input   IS 'usage.input_tokens de la respuesta Anthropic (para análisis de costo).';
COMMENT ON COLUMN public.avi_conversaciones.tokens_output  IS 'usage.output_tokens de la respuesta Anthropic (para análisis de costo).';

-- Índice para consultas de FAQ: filtrar por módulo y estado de aprobación.
CREATE INDEX IF NOT EXISTS idx_avi_conv_modulo_aprobada
    ON public.avi_conversaciones (modulo, aprobada);

-- Índice para listar candidatas a FAQ rápidamente.
CREATE INDEX IF NOT EXISTS idx_avi_conv_marcada_faq
    ON public.avi_conversaciones (marcada_faq)
    WHERE marcada_faq = TRUE;

-- Índice temporal para consultas de historial de un usuario (uso secundario).
CREATE INDEX IF NOT EXISTS idx_avi_conv_usuario_fecha
    ON public.avi_conversaciones (usuario_id, fecha DESC);


-- ── 3. Row-Level Security ─────────────────────────────────────────────────────
--
-- El backend accede con service_role (clave de servidor) que omite RLS.
-- Las políticas aquí protegen accesos directos de clientes (anon/authenticated)
-- si alguna vez se exponen estas tablas vía PostgREST o Supabase client-side.

ALTER TABLE public.avi_uso_diario    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avi_conversaciones ENABLE ROW LEVEL SECURITY;

-- avi_uso_diario: solo el propio usuario lee su fila (mediante cliente Supabase
-- autenticado con JWT de Supabase Auth, si se llegara a usar).
-- El service_role del backend lo omite por definición.
CREATE POLICY avi_uso_diario_usuario_propio
    ON public.avi_uso_diario
    FOR SELECT
    USING (usuario_id = (auth.jwt() ->> 'sub'));

-- avi_conversaciones: el propio usuario lee sus conversaciones.
CREATE POLICY avi_conv_usuario_propio
    ON public.avi_conversaciones
    FOR SELECT
    USING (usuario_id = (auth.jwt() ->> 'sub'));

-- Admins (rol authenticated con cargo Desarrollador/Administrador) podrán leer
-- todo mediante la función de panel FAQ (aún no implementada) usando service_role.
-- No se añade política adicional aquí: el backend siempre usa service_role.


-- ── 4. Tarea de limpieza sugerida (no ejecutar automáticamente) ──────────────
--
-- Para evitar crecimiento ilimitado de avi_uso_diario, ejecutar periódicamente:
--
--   DELETE FROM public.avi_uso_diario WHERE fecha < CURRENT_DATE - INTERVAL '90 days';
--
-- Se puede programar con pg_cron en Supabase (Database → Extensions → pg_cron):
--
--   SELECT cron.schedule(
--       'limpiar_avi_uso_diario',
--       '0 3 * * *',   -- cada día a las 3 AM UTC
--       $$ DELETE FROM public.avi_uso_diario WHERE fecha < CURRENT_DATE - 7 $$
--   );
--
-- Para avi_conversaciones no se recomienda borrado automático (son candidatas FAQ).
-- Decidir política de retención según normativa del proyecto.


-- ── 5. Tabla avi_feedback — encuesta de satisfacción al cerrar Clara ─────────

CREATE TABLE IF NOT EXISTS public.avi_feedback (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id   text        NOT NULL,
    util         boolean     NOT NULL,
    comentario   text,                          -- opcional, null permitido
    modulo       text,                          -- módulo activo al cerrar
    fecha        timestamptz NOT NULL DEFAULT now()
);

-- Índices para análisis de satisfacción
CREATE INDEX IF NOT EXISTS avi_feedback_util_idx
    ON public.avi_feedback (util);

CREATE INDEX IF NOT EXISTS avi_feedback_modulo_util_idx
    ON public.avi_feedback (modulo, util);

-- RLS
ALTER TABLE public.avi_feedback ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario puede insertar sus respuestas
CREATE POLICY "avi_feedback_insert_own"
    ON public.avi_feedback
    FOR INSERT
    TO authenticated
    WITH CHECK (usuario_id = auth.uid()::text);

-- Solo el propio usuario puede leer sus respuestas
CREATE POLICY "avi_feedback_select_own"
    ON public.avi_feedback
    FOR SELECT
    TO authenticated
    USING (usuario_id = auth.uid()::text);


-- ── 6. Notificar a PostgREST para recargar el esquema ────────────────────────
--
-- Si las tablas no aparecen en la API de Supabase tras aplicar este script:
--   NOTIFY pgrst, 'reload schema';
