-- ── ClaraCore: Pizarra del contrato (post-its desde Bloc de notas) ──
-- Idempotente. No elimina tablas de Novedades (solo deja de usarse en UI).

CREATE TABLE IF NOT EXISTS bloc_notas_pizarra (
  id uuid PRIMARY KEY,
  note_id uuid NOT NULL,
  contrato_id bigint NOT NULL,
  usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  visibilidad text NOT NULL CHECK (visibilidad IN ('solo_yo', 'contrato')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  rev bigint NOT NULL DEFAULT 1,
  device_id text,
  CONSTRAINT bloc_notas_pizarra_note_unique UNIQUE (note_id)
);

CREATE INDEX IF NOT EXISTS idx_bloc_pizarra_contrato
  ON bloc_notas_pizarra (contrato_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bloc_pizarra_owner
  ON bloc_notas_pizarra (usuario_id, contrato_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE bloc_notas_pizarra IS
  'Post-its de la Pizarra de Inicio. solo_yo = dueño; contrato = todos del contrato. Quitar no borra la nota.';
