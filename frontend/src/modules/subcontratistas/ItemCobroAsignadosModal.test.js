import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Espejo ligero de la regla de filas a guardar (no vacío, número >= 0).
 */
function itemsToSaveFromDrafts(rows, drafts) {
  const out = []
  for (const r of rows) {
    const key = String(r.listado_precio_id)
    const raw = String(drafts[key] ?? '').trim()
    if (raw === '') continue
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) continue
    out.push({ listado_precio_id: Number(r.listado_precio_id), precio_unitario_sub: n })
  }
  return out
}

describe('ItemCobroAsignados drafts', () => {
  it('incluye solo VU Costo M.O. válidos y no vacíos', () => {
    const rows = [
      { listado_precio_id: 1 },
      { listado_precio_id: 2 },
      { listado_precio_id: 3 },
    ]
    const drafts = { 1: '100', 2: '', 3: '-5', 4: '1' }
    const out = itemsToSaveFromDrafts(rows, drafts)
    assert.deepEqual(out, [{ listado_precio_id: 1, precio_unitario_sub: 100 }])
  })

  it('acepta coma decimal', () => {
    const out = itemsToSaveFromDrafts([{ listado_precio_id: 9 }], { 9: '12,5' })
    assert.equal(out[0].precio_unitario_sub, 12.5)
  })
})
