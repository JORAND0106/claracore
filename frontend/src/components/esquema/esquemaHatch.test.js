import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dilateVisitedIntoBarriers, hatchRasterScale } from './esquemaHatch.js'
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
})
