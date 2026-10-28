-- Reportes de transporte (Obra Ejecutada): lote + enlace en presupuesto.
-- Ejecutar en Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS presupuesto_transporte_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  capitulo TEXT NOT NULL,
  competencia TEXT NOT NULL DEFAULT '',
  items_origen TEXT[] NOT NULL DEFAULT '{}',
  item_destino TEXT NOT NULL,
  cantidad_reportada NUMERIC(18, 4) NOT NULL,
  n_registros INTEGER NOT NULL DEFAULT 0,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  reemplazado_por UUID REFERENCES presupuesto_transporte_lotes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppto_transporte_lotes_contrato
  ON presupuesto_transporte_lotes (contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_ppto_transporte_lotes_clave
  ON presupuesto_transporte_lotes (contrato_id, capitulo, competencia, item_destino)
  WHERE activo = TRUE;

ALTER TABLE presupuesto
  ADD COLUMN IF NOT EXISTS transporte_lote_id UUID REFERENCES presupuesto_transporte_lotes(id);

CREATE INDEX IF NOT EXISTS idx_presupuesto_transporte_lote
  ON presupuesto (transporte_lote_id)
  WHERE transporte_lote_id IS NOT NULL;
