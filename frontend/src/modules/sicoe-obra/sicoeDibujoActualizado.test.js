import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import {
  SICOE_DIBUJO_ACTUALIZADO_EVENT,
  notifyDibujoReporteActualizado,
  subscribeDibujoReporteActualizado,
} from './sicoeDibujoActualizado.js'

describe('sicoeDibujoActualizado', () => {
  const listeners = new Map()
  before(() => {
    globalThis.window = {
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(fn)
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn)
      },
      dispatchEvent(ev) {
        const set = listeners.get(ev.type)
        if (!set) return true
        for (const fn of set) fn(ev)
        return true
      },
    }
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type
        this.detail = init.detail
      }
    }
  })
  after(() => {
    delete globalThis.window
    delete globalThis.CustomEvent
  })

  it('dispara CustomEvent con reporteId', () => {
    const seen = []
    const unsub = subscribeDibujoReporteActualizado((d) => seen.push(d))
    notifyDibujoReporteActualizado({
      contratoId: 2,
      reporteId: 60,
      dibujo_geojson: { type: 'FeatureCollection', features: [] },
    })
    unsub()
    assert.equal(seen.length, 1)
    assert.equal(seen[0].reporteId, '60')
    assert.equal(seen[0].contratoId, 2)
    assert.equal(SICOE_DIBUJO_ACTUALIZADO_EVENT.includes('dibujo'), true)
  })

  it('no dispara sin reporteId', () => {
    const seen = []
    const unsub = subscribeDibujoReporteActualizado((d) => seen.push(d))
    notifyDibujoReporteActualizado({ contratoId: 1 })
    unsub()
    assert.equal(seen.length, 0)
  })
})
