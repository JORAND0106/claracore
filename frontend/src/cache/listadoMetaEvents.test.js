/**
 * @fileoverview Tests — notifyListadoMetaChanged invalida caches de vista.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  buildVistaCacheKey,
  setVistaCache,
  getVistaCache,
  clearVistaCache,
} from './vistaCache.js'
import { notifyListadoMetaChanged, CC_LISTADO_META_CHANGED } from './listadoMetaEvents.js'

describe('listadoMetaEvents', () => {
  beforeEach(() => {
    clearVistaCache()
  })

  it('exporta el nombre del evento', () => {
    assert.equal(CC_LISTADO_META_CHANGED, 'cc-listado-meta-changed')
  })

  it('notifyListadoMetaChanged invalida vistas del contrato', () => {
    const key = buildVistaCacheKey('presupuesto', 7, 'grid')
    setVistaCache(key, { rows: [1] }, { ttl: 60_000 })
    assert.ok(getVistaCache(key))
    notifyListadoMetaChanged(7)
    assert.equal(getVistaCache(key), null)
  })

  it('notifyListadoMetaChanged dispara CustomEvent', () => {
    const seen = []
    const listeners = new Map()
    const fakeWindow = {
      dispatchEvent(ev) {
        const hs = listeners.get(ev.type) || []
        for (const h of hs) h(ev)
        return true
      },
      addEventListener(type, h) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(h)
      },
      removeEventListener(type, h) {
        const hs = listeners.get(type) || []
        listeners.set(type, hs.filter((x) => x !== h))
      },
    }
    globalThis.window = fakeWindow
    const handler = (ev) => seen.push(ev.detail?.contratoId)
    fakeWindow.addEventListener(CC_LISTADO_META_CHANGED, handler)
    try {
      notifyListadoMetaChanged(42)
      assert.deepEqual(seen, [42])
    } finally {
      fakeWindow.removeEventListener(CC_LISTADO_META_CHANGED, handler)
    }
  })
})
