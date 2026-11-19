import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEsquemaModalResizeDelta,
  clampEsquemaModalOuterSize,
  defaultEsquemaModalOuterSize,
  ESQUEMA_MODAL_MIN_DRAW,
  ESQUEMA_MODAL_MIN_H,
  ESQUEMA_MODAL_RESIZE_EDGES,
  ESQUEMA_MODAL_SIZE_KEY,
  esquemaModalMinOuter,
  esquemaModalResizeCursor,
  esquemaModalViewportBudget,
  readEsquemaModalSizePref,
  resolveEsquemaModalLayout,
  writeEsquemaModalSizePref,
} from './esquemaModalResize.js'
import { ESQUEMA_CONTEXT_SIDEBAR_W } from './esquemaGeometry.js'

function memStore(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

describe('esquemaModalResize · presupuesto y clamp', () => {
  it('viewport budget no supera la pantalla y respeta mínimos', () => {
    const b = esquemaModalViewportBudget(1400, 900)
    assert.ok(b.maxW <= 1400)
    assert.ok(b.maxH <= 900)
    assert.ok(b.maxW >= ESQUEMA_MODAL_MIN_DRAW)
    assert.ok(b.maxH >= ESQUEMA_MODAL_MIN_H)
  })

  it('mínimo incluye panel lateral + dibujo usable', () => {
    const m = esquemaModalMinOuter(ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(m.minW, ESQUEMA_MODAL_MIN_DRAW + ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(m.minH, ESQUEMA_MODAL_MIN_H)
  })

  it('clamp no baja del mínimo ni pasa del máximo', () => {
    const c = clampEsquemaModalOuterSize(
      { w: 100, h: 50 },
      { maxW: 1200, maxH: 800, sidebarW: 300 },
    )
    assert.ok(c.w >= 580)
    assert.ok(c.h >= ESQUEMA_MODAL_MIN_H)
    const big = clampEsquemaModalOuterSize(
      { w: 5000, h: 4000 },
      { maxW: 1000, maxH: 700, sidebarW: 300 },
    )
    assert.equal(big.w, 1000)
    assert.equal(big.h, 700)
  })

  it('arrastre se / e / s cambia dimensiones; n / w en sentido inverso', () => {
    const base = { w0: 900, h0: 700, maxW: 1400, maxH: 1000, sidebarW: 300 }
    const se = applyEsquemaModalResizeDelta({ ...base, edge: 'se', dx: 40, dy: 30 })
    assert.equal(se.w, 940)
    assert.equal(se.h, 730)
    const e = applyEsquemaModalResizeDelta({ ...base, edge: 'e', dx: 20, dy: 99 })
    assert.equal(e.w, 920)
    assert.equal(e.h, 700)
    const w = applyEsquemaModalResizeDelta({ ...base, edge: 'w', dx: -30, dy: 0 })
    assert.equal(w.w, 930)
    const n = applyEsquemaModalResizeDelta({ ...base, edge: 'n', dx: 0, dy: -20 })
    assert.equal(n.h, 720)
  })

  it('persistencia localStorage del último tamaño', () => {
    const store = memStore()
    assert.equal(readEsquemaModalSizePref(store), null)
    assert.equal(writeEsquemaModalSizePref({ w: 1100, h: 820 }, store), true)
    assert.ok(store.getItem(ESQUEMA_MODAL_SIZE_KEY))
    assert.deepEqual(readEsquemaModalSizePref(store), { w: 1100, h: 820 })
  })

  it('resolve usa preferencia y al girar/acotar no pierde el tamaño pedido', () => {
    const store = memStore()
    writeEsquemaModalSizePref({ w: 1100, h: 820 }, store)
    const a = resolveEsquemaModalLayout({
      vpW: 1400, vpH: 900, sidebarW: 300, storage: store,
    })
    assert.equal(a.w, 1100)
    assert.equal(a.h, 820)
    // Viewport más pequeño (giro iPad): acota sin caer bajo el mínimo.
    const b = resolveEsquemaModalLayout({
      vpW: 900, vpH: 700, sidebarW: 300, storage: store,
    })
    const budget = esquemaModalViewportBudget(900, 700)
    assert.ok(b.w <= budget.maxW)
    assert.ok(b.h <= budget.maxH)
    assert.ok(b.w >= ESQUEMA_MODAL_MIN_DRAW + 300)
  })

  it('sin preferencia usa default cuadrado histórico', () => {
    const d = defaultEsquemaModalOuterSize(1400, 900, 300)
    assert.ok(d.w >= d.h)
    assert.ok(d.side >= ESQUEMA_MODAL_MIN_DRAW)
  })

  it('bordes y cursores cubiertos', () => {
    assert.ok(ESQUEMA_MODAL_RESIZE_EDGES.includes('se'))
    assert.equal(esquemaModalResizeCursor('se'), 'nwse-resize')
    assert.equal(esquemaModalResizeCursor('e'), 'ew-resize')
  })
})
