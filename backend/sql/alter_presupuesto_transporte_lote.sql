-- Reportes de transporte (Obra Ejecutada): lote + enlace en presupuesto.
-- Ejecutar en Supabase SQL Editor (idempotente).
-- Clave de reporte: capitulo_origen + competencia_origen + items_origen +
-- capitulo_destino + competencia_destino + item_destino.

CREATE TABLE IF NOT EXISTS presupuesto_transporte_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  -- Origen (búsqueda de cantidades; todas las competencias del capítulo)
  capitulo TEXT NOT NULL,
  items_origen TEXT[] NOT NULL DEFAULT '{}',
  -- Destino de los registros nuevos
  competencia TEXT NOT NULL DEFAULT '',
  item_destino TEXT NOT NULL,
  capitulo_origen TEXT,
  capitulo_destino TEXT,
  competencia_destino TEXT,
  cantidad_reportada NUMERIC(18, 4) NOT NULL,
  n_registros INTEGER NOT NULL DEFAULT 0,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  reemplazado_por UUID REFERENCES presupuesto_transporte_lotes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columnas nuevas si la tabla ya existía con el esquema anterior.
ALTER TABLE presupuesto_transporte_lotes
  ADD COLUMN IF NOT EXISTS capitulo_origen TEXT;
ALTER TABLE presupuesto_transporte_lotes
  ADD COLUMN IF NOT EXISTS capitulo_destino TEXT;
ALTER TABLE presupuesto_transporte_lotes
  ADD COLUMN IF NOT EXISTS competencia_destino TEXT;
ALTER TABLE presupuesto_transporte_lotes
  ADD COLUMN IF NOT EXISTS competencia_origen TEXT;

-- Backfill desde columnas legacy (capitulo / competencia).
UPDATE presupuesto_transporte_lotes
SET
  capitulo_origen = COALESCE(NULLIF(capitulo_origen, ''), capitulo),
  capitulo_destino = COALESCE(NULLIF(capitulo_destino, ''), capitulo),
  competencia_destino = COALESCE(NULLIF(competencia_destino, ''), competencia)
WHERE capitulo_origen IS NULL
   OR capitulo_destino IS NULL
   OR competencia_destino IS NULL;

CREATE INDEX IF NOT EXISTS idx_ppto_transporte_lotes_contrato
  ON presupuesto_transporte_lotes (contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_ppto_transporte_lotes_clave
  ON presupuesto_transporte_lotes (contrato_id, capitulo, competencia, item_destino)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_ppto_transporte_lotes_clave_v2
  ON presupuesto_transporte_lotes (
    contrato_id,
    capitulo_origen,
    capitulo_destino,
    competencia_destino,
    item_destino
  )
  WHERE activo = TRUE;

ALTER TABLE presupuesto
  ADD COLUMN IF NOT EXISTS transporte_lote_id UUID REFERENCES presupuesto_transporte_lotes(id);

CREATE INDEX IF NOT EXISTS idx_presupuesto_transporte_lote
  ON presupuesto (transporte_lote_id)
  WHERE transporte_lote_id IS NOT NULL;
