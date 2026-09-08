import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  angleDegBetween,
  cotaArrowHeadLength,
  ellipseFromCenter,
  lineLineIntersection,
  pointOnEllipseToward,
  PX_PER_METER,
  repositionCota,
} from './esquemaGeometry.js'
import {
  cotaText,
  createCota,
  createCotaAngle,
  createCotaDiametro,
  createCotaFromSegments,
  createCotaRadio,
  DEFAULT_COTA_OFFSET,
} from './esquemaCota.js'

describe('esquemaCota', () => {
  it('stores a recognized cota entity with automatic meter text', () => {
    const cota = createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 1.2, y: 0 })
    assert.equal(cota.type, 'cota')
    assert.equal(cota.kind, 'linear')
    assert.equal(cota.offset, DEFAULT_COTA_OFFSET)
    assert.equal(cota.text, '1.20 m')
    assert.equal(cotaText({ ...cota, x2: PX_PER_METER * 2 }), '2.00 m')
  })

  it('keeps arrow length independent of the measured span', () => {
    const head1 = cotaArrowHeadLength(1)
    const headFar = cotaArrowHeadLength(1)
    assert.equal(head1, headFar)
    assert.ok(head1 < 20)
    const moved = repositionCota(
      createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 4, y: 0 }),
      { x: PX_PER_METER * 2, y: 80 },
    )
    assert.equal(moved.x2, PX_PER_METER * 4)
    assert.equal(moved.text, '4.00 m')
    assert.ok(moved.offset < 0)
  })

  it('creates an angle dimension of 90° from two segments or three points', () => {
    assert.ok(Math.abs(angleDegBetween({ x: 1, y: 0 }, { x: 0, y: 1 }) - 90) < 1e-6)
    const fromPts = createCotaAngle({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 })
    assert.equal(fromPts.kind, 'angle')
    assert.equal(fromPts.text, '90.0°')
    const v = lineLineIntersection({ x: 0, y: 10 }, { x: 40, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 40 })
    assert.equal(v.x, 10)
    assert.equal(v.y, 10)
    const fromSegs = createCotaFromSegments(
      { a: { x: 0, y: 10 }, b: { x: 40, y: 10 } },
      { a: { x: 10, y: 0 }, b: { x: 10, y: 40 } },
      { pickA: { x: 40, y: 10 }, pickB: { x: 10, y: 40 } },
    )
    assert.equal(fromSegs.text, '90.0°')
    const moved = repositionCota(fromPts, { x: 30, y: 30 })
    assert.equal(moved.text, '90.0°')
    assert.ok(moved.offset > 12)
    assert.equal(moved.x1, 0)
  })

  it('creates radius and diameter cotas on a 1 m circle with R / ⌀ prefixes', () => {
    const circle = { type: 'elipse', ...ellipseFromCenter(0, 0, PX_PER_METER, 0, { circle: true }) }
    const rim = pointOnEllipseToward(circle, { x: PX_PER_METER, y: 0 })
    assert.ok(Math.abs(rim.x - PX_PER_METER) < 1e-6)
    const radio = createCotaRadio(circle, { x: PX_PER_METER, y: 0 })
    assert.equal(radio.kind, 'radio')
    assert.equal(radio.text, 'R 1.00 m')
    const diam = createCotaDiametro(circle, { x: PX_PER_METER, y: 0 })
    assert.equal(diam.kind, 'diametro')
    assert.equal(diam.text, '⌀ 2.00 m')
    const spun = repositionCota(radio, { x: 0, y: 80 })
    assert.equal(cotaText(spun), 'R 1.00 m')
    assert.ok(Math.abs(spun.x1) < 1e-6)
    assert.ok(Math.abs(spun.y2 - PX_PER_METER) < 1e-6)
    const spunD = repositionCota(diam, { x: 0, y: 80 })
    assert.equal(cotaText(spunD), '⌀ 2.00 m')
  })
})
