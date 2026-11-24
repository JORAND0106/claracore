import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyHatchToEntity,
  dilateVisitedIntoBarriers,
  entityCanReceiveHatch,
  entityHatchIsClosed,
  hatchBoundsPad,
  hatchMaskEntryBroken,
  hatchMaskEntryReady,
  hatchRasterScale,
  polylineClosedForHatch,
  resolveHatchTarget,
} from './esquemaHatch.js'
import { floodPixelsToM2, PX_PER_METER } from './esquemaGeometry.js'

describe('esquemaHatch dilate + area', () => {
  it('dilata solo hacia píxeles barrera', () => {
    const rw = 5
    const rh = 5
    const visited = new Uint8Array(rw * rh)
    // Interior 3x3 centrado
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) visited[y * rw + x] = 1
    }
    const before = visited.reduce((s, v) => s + v, 0)
    // Barrera en el anillo exterior (borde del canvas)
    const data = new Uint8ClampedArray(rw * rh * 4)
    data.fill(255)
    for (let i = 0; i < rw * rh; i += 1) {
      const x = i % rw
      const y = (i / rw) | 0
      const edge = x === 0 || y === 0 || x === rw - 1 || y === rh - 1
      if (edge) {
        data[i * 4] = 0
        data[i * 4 + 1] = 0
        data[i * 4 + 2] = 0
      }
    }
    const added = dilateVisitedIntoBarriers(visited, data, rw, rh, 2)
    assert.ok(added > 0)
    assert.equal(visited.reduce((s, v) => s + v, 0), before + added)
    // El centro sigue visitado
    assert.equal(visited[2 * rw + 2], 1)
  })

  it('floodPixelsToM2 coincide con L×A de un rectángulo rasterizado ideal', () => {
    // Rectángulo 2 m × 1 m → world 100 × 50 (PX_PER_METER=50)
    const worldW = 2 * PX_PER_METER
    const worldH = 1 * PX_PER_METER
    const scale = hatchRasterScale(worldW, worldH)
    const pixels = Math.round(worldW * scale) * Math.round(worldH * scale)
    const m2 = floodPixelsToM2(pixels, scale)
    assert.ok(Math.abs(m2 - 2) < 0.05, `expected ~2 m², got ${m2}`)
  })

  it('hatchBoundsPad deja corona exterior en escenas grandes (evita reject 85 %)', () => {
    const pad = hatchBoundsPad(1800, 1400, 32)
    assert.ok(pad > 32)
    const bw = 1800 + pad * 2
    const bh = 1400 + pad * 2
    const frac = (1800 * 1400) / (bw * bh)
    assert.ok(frac < 0.85, `frac=${frac} aún ≥ 0.85 con pad=${pad}`)
  })

  it('polylineClosedForHatch respeta closed=true y anillo casi cerrado (OSNAP)', () => {
    const open = {
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    }
    assert.equal(polylineClosedForHatch(open), false)
    assert.equal(polylineClosedForHatch({ ...open, closed: true }), true)
    const ring = {
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0.5, y: 0.2 }],
    }
    assert.equal(polylineClosedForHatch(ring), true)
    // Gap dentro del umbral OSNAP (≤8) → cerrada para achurar
    const near = {
      type: 'polilinea',
      width: 3,
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }, { x: 4, y: 1 }],
    }
    assert.equal(polylineClosedForHatch(near), true)
  })

  it('hatchMaskEntryReady/Broken detectan máscara usable vs rota', () => {
    assert.equal(hatchMaskEntryReady(null), false)
    assert.equal(hatchMaskEntryBroken(null), false)
    assert.equal(hatchMaskEntryReady({ complete: true, naturalWidth: 64 }), true)
    assert.equal(hatchMaskEntryBroken({ complete: true, naturalWidth: 0 }), true)
    assert.equal(hatchMaskEntryReady({ complete: false, naturalWidth: 0 }), false)
    assert.equal(hatchMaskEntryBroken({ complete: false, naturalWidth: 0 }), false)
  })

  it('resolveHatchTarget exige selección o hit cerrado; avisa si abierto', () => {
    const rect = { id: 'r1', type: 'rect', x1: 0, y1: 0, x2: 40, y2: 30 }
    const open = {
      id: 'p1',
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 0, y: 40 }],
    }
    const closed = { ...open, id: 'p2', closed: true }
    assert.equal(entityCanReceiveHatch(rect), true)
    assert.equal(entityHatchIsClosed(rect), true)
    assert.equal(entityHatchIsClosed(open), false)

    const noSel = resolveHatchTarget({ objects: [rect], selectedIds: [], hitId: null })
    assert.equal(noSel.ok, false)
    assert.equal(noSel.error, 'Seleccione un contorno')

    const bySel = resolveHatchTarget({ objects: [rect], selectedIds: ['r1'], hitId: null })
    assert.equal(bySel.ok, true)
    assert.equal(bySel.entity.id, 'r1')

    const byHit = resolveHatchTarget({ objects: [closed], selectedIds: [], hitId: 'p2' })
    assert.equal(byHit.ok, true)

    const openSel = resolveHatchTarget({ objects: [open], selectedIds: ['p1'], hitId: null })
    assert.equal(openSel.ok, false)
    assert.equal(openSel.error, 'El contorno no está cerrado')
  })

  it('applyHatchToEntity fija hatch y cierra poli casi cerrada; se conserva al “mover”', () => {
    const elipse = { id: 'e1', type: 'elipse', x1: 0, y1: 0, x2: 20, y2: 10 }
    const hatched = applyHatchToEntity(elipse, 2)
    assert.equal(hatched.hatch, 2)
    // Mover / rotar / escalar: la propiedad hatch viaja con la entidad
    const moved = { ...hatched, x1: 10, y1: 10, x2: 30, y2: 20, rotation: Math.PI / 6 }
    assert.equal(moved.hatch, 2)

    const near = {
      id: 'p3',
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }, { x: 2, y: 1 }],
    }
    const polyH = applyHatchToEntity(near, 0)
    assert.ok(polyH)
    assert.equal(polyH.closed, true)
    assert.equal(polyH.hatch, 0)

    assert.equal(applyHatchToEntity(openLine(), 0), null)
  })
})

function openLine() {
  return {
    id: 'open',
    type: 'polilinea',
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
  }
}
