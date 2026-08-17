/**
 * Caché de grilla de salidas (Ctrl+Tab / remount sin refetch).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const TTL_MS = 5 * 60 * 1000

function makeCache() {
  const map = new Map()
  return {
    read(contratoId, now = Date.now()) {
      const entry = map.get(String(contratoId || 'x'))
      if (!entry) return null
      if (now - entry.at > TTL_MS) return null
      return entry.rows
    },
    write(contratoId, rows, now = Date.now()) {
      map.set(String(contratoId || 'x'), { at: now, rows: Array.isArray(rows) ? rows : [] })
    },
    invalidate(contratoId) {
      map.delete(String(contratoId || 'x'))
    },
  }
}

describe('salidas list cache', () => {
  it('sirve filas calientes sin refetch', () => {
    const c = makeCache()
    const rows = [{ id: 1 }, { id: 2 }]
    const t0 = 1_000_000
    c.write(7, rows, t0)
    assert.deepEqual(c.read(7, t0 + 1000), rows)
  })

  it('expira tras TTL (simula no usar caché vieja)', () => {
    const c = makeCache()
    c.write(7, [{ id: 1 }], 1_000_000)
    assert.equal(c.read(7, 1_000_000 + TTL_MS + 1), null)
  })

  it('invalidate fuerza recarga en el siguiente mount', () => {
    const c = makeCache()
    c.write(7, [{ id: 1 }], 1_000_000)
    c.invalidate(7)
    assert.equal(c.read(7, 1_000_001), null)
  })
})
