import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarPendingPlanillaTopoEnReportes,
  aplicarPlanillaTopoEnReportes,
  coloresSinDibujoGrilla,
  colorIconoPlanillaTopo,
  esFondoOscuroTema,
  notifyPlanillaTopoGrillaChanged,
  reporteTienePlanillaTopografia,
  SICOE_PLANILLA_TOPO_GRILLA_EVENT,
} from './sicoeGrillaReportesIndicadores.js'

describe('sicoeGrillaReportesIndicadores', () => {
  it('detecta tema oscuro y elige gris legible', () => {
    assert.equal(esFondoOscuroTema({ bgCard: '#0F2038' }), true)
    assert.equal(esFondoOscuroTema({ bgCard: '#FFFFFF' }), false)
    assert.equal(esFondoOscuroTema({ bgCard: '#F2EDE4' }), false)
    const dark = coloresSinDibujoGrilla({ bgCard: '#0F2038' })
    const light = coloresSinDibujoGrilla({ bgCard: '#FFFFFF' })
    assert.match(dark.border, /#94a3b8/i)
    assert.match(light.border, /#475569/i)
    assert.notEqual(dark.background, light.background)
  })

  it('color de planilla distinto del primary típico del clip', () => {
    assert.match(colorIconoPlanillaTopo({ bgCard: '#FFFFFF' }), /#0f766e/i)
    assert.match(colorIconoPlanillaTopo({ bgCard: '#0F2038' }), /#5eead4/i)
  })

  it('reporteTienePlanillaTopografia solo con flag true', () => {
    assert.equal(reporteTienePlanillaTopografia({ tiene_planilla_topografia: true }), true)
    assert.equal(reporteTienePlanillaTopografia({ tiene_planilla_topografia: false }), false)
    assert.equal(reporteTienePlanillaTopografia({}), false)
    assert.equal(reporteTienePlanillaTopografia(null), false)
  })

  it('aplicarPlanillaTopoEnReportes marca y desmarca por id', () => {
    const base = [
      { id: 1, tiene_planilla_topografia: false },
      { id: 2, tiene_planilla_topografia: true },
      { id: 3 },
    ]
    const on = aplicarPlanillaTopoEnReportes(
      base,
      { reporteIds: [1, 3], tiene: true, contratoId: 10 },
      10,
    )
    assert.equal(on[0].tiene_planilla_topografia, true)
    assert.equal(on[1].tiene_planilla_topografia, true)
    assert.equal(on[2].tiene_planilla_topografia, true)

    const off = aplicarPlanillaTopoEnReportes(
      on,
      { reporteIds: ['2'], tiene: false, contratoId: 10 },
      10,
    )
    assert.equal(off[1].tiene_planilla_topografia, false)

    const same = aplicarPlanillaTopoEnReportes(
      off,
      { reporteIds: [9], tiene: true, contratoId: 10 },
      10,
    )
    assert.equal(same, off)

    const otherContract = aplicarPlanillaTopoEnReportes(
      off,
      { reporteIds: [1], tiene: false, contratoId: 99 },
      10,
    )
    assert.equal(otherContract, off)
  })

  it('notify + pending sobreviven al remontar la grilla', () => {
    const prev = globalThis.window
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
    }
    globalThis.window = {
      dispatchEvent() { return true },
    }
    try {
      notifyPlanillaTopoGrillaChanged({
        contratoId: 5,
        reporteIds: [11],
        tiene: true,
      })
      const applied = aplicarPendingPlanillaTopoEnReportes(
        [{ id: 11, tiene_planilla_topografia: false }, { id: 12 }],
        5,
      )
      assert.equal(applied[0].tiene_planilla_topografia, true)
      assert.equal(applied[1].tiene_planilla_topografia, undefined)
      const again = aplicarPendingPlanillaTopoEnReportes(applied, 5)
      assert.equal(again[0].tiene_planilla_topografia, true)
    } finally {
      globalThis.window = prev
      delete globalThis.sessionStorage
    }
  })

  it('notifyPlanillaTopoGrillaChanged dispara CustomEvent', () => {
    const prev = globalThis.window
    let seen = null
    globalThis.window = {
      dispatchEvent(ev) {
        seen = ev
        return true
      },
    }
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
    }
    try {
      notifyPlanillaTopoGrillaChanged({
        contratoId: 5,
        reporteIds: [11, 12],
        tiene: true,
      })
      assert.equal(seen?.type, SICOE_PLANILLA_TOPO_GRILLA_EVENT)
      assert.equal(seen.detail.contratoId, 5)
      assert.deepEqual(seen.detail.reporteIds, ['11', '12'])
      assert.equal(seen.detail.tiene, true)

      seen = null
      notifyPlanillaTopoGrillaChanged({ reporteIds: [] })
      assert.equal(seen, null)
    } finally {
      globalThis.window = prev
      delete globalThis.sessionStorage
    }
  })
})
