/**
 * Regresión: zoom centrado en el gesto (pinch / rueda) del plano topográfico.
 * Ejecutar: node --test frontend/src/components/topografia/topoViewportMath.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zoomPanAtPoint } from './topoViewportMath.js'

describe('zoomPanAtPoint', () => {
  it('zoom en el centro escala el pan existente proporcionalmente', () => {
    const origin = { x: 100, y: 80 }
    const focal = { x: 100, y: 80 }
    const r = zoomPanAtPoint({ x: 10, y: -5 }, 1, 2, focal, origin)
    assert.equal(r.scale, 2)
    assert.ok(Math.abs(r.pan.x - 20) < 1e-9)
    assert.ok(Math.abs(r.pan.y - -10) < 1e-9)
  })

  it('zoom hacia un punto lateral ajusta pan para fijar el foco', () => {
    const origin = { x: 100, y: 100 }
    const focal = { x: 150, y: 100 }
    const r = zoomPanAtPoint({ x: 0, y: 0 }, 1, 2, focal, origin)
    assert.equal(r.scale, 2)
    assert.ok(Math.abs(r.pan.x - -50) < 1e-9)
    assert.ok(Math.abs(r.pan.y - 0) < 1e-9)
  })

  it('respeta límites de escala', () => {
    const o = { x: 0, y: 0 }
    const f = { x: 0, y: 0 }
    assert.equal(zoomPanAtPoint({ x: 0, y: 0 }, 1, 100, f, o).scale, 12)
    assert.equal(zoomPanAtPoint({ x: 0, y: 0 }, 1, 0.01, f, o).scale, 0.4)
  })
})
