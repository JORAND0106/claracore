import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PX_PER_METER } from './esquemaGeometry.js'
import {
  distWorld,
  imageScaleFactorFromReference,
  scaleSceneByImageReference,
} from './esquemaImageScale.js'

describe('esquemaImageScale', () => {
  it('calcula factor desde distancia world y metros reales', () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 100, y: 0 }
    assert.equal(distWorld(p1, p2), 100)
    // 100 world = 2 m actuales; queremos 4 m → factor 2
    const f = imageScaleFactorFromReference(p1, p2, 4)
    assert.ok(Math.abs(f - ((4 * PX_PER_METER) / 100)) < 1e-9)
  })

  it('acepta decimales con coma', () => {
    const f = imageScaleFactorFromReference({ x: 0, y: 0 }, { x: 50, y: 0 }, '4,50')
    assert.ok(f != null)
    assert.ok(Math.abs(f - ((4.5 * PX_PER_METER) / 50)) < 1e-9)
  })

  it('escala imagen y dibujos solapados; deja fuera lo lejano', () => {
    const img = { id: 'img', type: 'image', fit: false, x: 0, y: 0, w: 200, h: 100 }
    const onImg = { id: 'l1', type: 'linea', x1: 10, y1: 10, x2: 50, y2: 10 }
    const far = { id: 'l2', type: 'linea', x1: 1000, y1: 1000, x2: 1100, y2: 1000 }
    const next = scaleSceneByImageReference(
      [img, onImg, far],
      'img',
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      4, // 100 world → 4 m → factor = 2
    )
    const ni = next.find((o) => o.id === 'img')
    const nl = next.find((o) => o.id === 'l1')
    const nf = next.find((o) => o.id === 'l2')
    assert.ok(Math.abs(ni.w - 400) < 1e-6)
    assert.ok(Math.abs(ni.h - 200) < 1e-6)
    // centro imagen (100,50); línea escala ×2 alrededor del centro
    assert.ok(Math.abs(nl.x1 - (100 + (10 - 100) * 2)) < 1e-6)
    assert.equal(nf.x1, 1000)
  })
})
