-- ── ClaraCore: Bloc de notas de campo (privado por usuario + contrato) ──
-- Idempotente.

INSERT INTO public.funciones (codigo, nombre, modulo)
SELECT 'BLOCNT', 'Bloc de notas', 'Campo'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.funciones f
  WHERE lower(trim(f.nombre)) IN ('bloc de notas', 'bloc de notas de campo')
     OR (f.codigo IS NOT NULL AND upper(trim(f.codigo::text)) = 'BLOCNT')
);

CREATE TABLE IF NOT EXISTS bloc_notas_folders (
  id uuid PRIMARY KEY,
  contrato_id bigint NOT NULL,
  usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  rev bigint NOT NULL DEFAULT 1,
  device_id text
);

CREATE INDEX IF NOT EXISTS idx_bloc_folders_user_contrato
  ON bloc_notas_folders (usuario_id, contrato_id);

CREATE TABLE IF NOT EXISTS bloc_notas_notes (
  id uuid PRIMARY KEY,
  folder_id uuid REFERENCES bloc_notas_folders(id) ON DELETE SET NULL,
  contrato_id bigint NOT NULL,
  usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  rev bigint NOT NULL DEFAULT 1,
  device_id text,
  conflict_of uuid
);

CREATE INDEX IF NOT EXISTS idx_bloc_notes_user_contrato
  ON bloc_notas_notes (usuario_id, contrato_id);

CREATE INDEX IF NOT EXISTS idx_bloc_notes_updated
  ON bloc_notas_notes (usuario_id, contrato_id, updated_at);
