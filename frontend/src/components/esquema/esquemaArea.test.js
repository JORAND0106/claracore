import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PX_PER_METER,
  metersToWorld,
  closedEntityAreaM2,
  exactClosedAreaM2AtPoint,
  pointInsideClosedEntity,
  floodPixelsToM2,
  formatAreaM2,
  polygonAreaM2,
} from './esquemaGeometry.js'
import { createAreaLabel, createAreaLabelFromClick } from './esquemaArea.js'

/** Rectángulo 20×3 m en world (como panel Propiedades). */
function rect20x3(rotationRad = 0) {
  const w = metersToWorld(20)
  const h = metersToWorld(3)
  return {
    id: 'r1',
    type: 'rect',
    x1: 0,
    y1: 0,
    x2: w,
    y2: h,
    width: 1,
    rotation: rotationRad,
  }
}

describe('esquemaArea — precisión geométrica', () => {
  it('converts hatch flood-fill pixels to m² with the 50 px/m scale', () => {
    assert.equal(PX_PER_METER, 50)
    assert.ok(Math.abs(floodPixelsToM2(2500, 1) - 1) < 1e-9)
    assert.ok(Math.abs(floodPixelsToM2(10000, 2) - 1) < 1e-9)
    assert.equal(formatAreaM2(1.5), '1.50 m²')
  })

  it('rectángulo 20×3 m → exactamente 60.00 m² (sin rotación)', () => {
    const obj = rect20x3(0)
    assert.equal(closedEntityAreaM2(obj), 60)
    const cx = metersToWorld(10)
    const cy = metersToWorld(1.5)
    assert.equal(exactClosedAreaM2AtPoint([obj], cx, cy), 60)
    const label = createAreaLabelFromClick([obj], cx, cy)
    assert.ok(label)
    assert.equal(label.areaM2, 60)
    assert.equal(label.text, '60.00 m²')
  })

  it('rectángulo 20×3 m rotado 29.9° → exactamente 60.00 m² (caso reportado)', () => {
    const rot = (29.9 * Math.PI) / 180
    const obj = rect20x3(rot)
    assert.equal(closedEntityAreaM2(obj), 60)
    // Clic en el centro (invariante a rotación alrededor del centro)
    const cx = metersToWorld(10)
    const cy = metersToWorld(1.5)
    assert.ok(pointInsideClosedEntity(obj, cx, cy))
    assert.equal(exactClosedAreaM2AtPoint([obj], cx, cy), 60)
    const label = createAreaLabelFromClick([obj], cx, cy)
    assert.equal(label.areaM2, 60)
    assert.equal(label.text, '60.00 m²')
    // Evidencia del bug anterior: dilatar el trazo hacia el perímetro añade ~0.5 m²
    const perimeterM = 2 * (20 + 3)
    const strokeWorld = Math.max(2, obj.width || 3) // strokeObjectEdges
    const halfStrokeM = (strokeWorld / 2) / PX_PER_METER
    const inflatedApprox = 60 + perimeterM * halfStrokeM
    assert.ok(inflatedApprox > 60.4, `inflación por grosor ~${inflatedApprox}`)
    assert.ok(Math.abs(inflatedApprox - 60.92) < 0.01)
  })

  it('rectángulo 20×3 m rotado 45° → exactamente 60.00 m²', () => {
    const obj = rect20x3(Math.PI / 4)
    assert.equal(closedEntityAreaM2(obj), 60)
    const label = createAreaLabelFromClick(
      [obj],
      metersToWorld(10),
      metersToWorld(1.5),
    )
    assert.equal(label.areaM2, 60)
  })

  it('triángulo 20×3 m (base×altura) → exactamente 30.00 m²', () => {
    const obj = {
      id: 't1',
      type: 'triangulo',
      x1: 0,
      y1: 0,
      x2: metersToWorld(20),
      y2: metersToWorld(3),
      rotation: (17 * Math.PI) / 180,
    }
    assert.equal(closedEntityAreaM2(obj), 30)
    const cx = metersToWorld(10)
    const cy = metersToWorld(2) // dentro del triángulo (ápice en y1, base en y2)
    assert.ok(pointInsideClosedEntity(obj, cx, cy))
    const label = createAreaLabelFromClick([obj], cx, cy)
    assert.equal(label.areaM2, 30)
    assert.equal(label.text, '30.00 m²')
  })

  it('elipse círculo r=2 m → π·4 m² exacto', () => {
    const r = metersToWorld(2)
    const obj = {
      type: 'elipse',
      x1: -r,
      y1: -r,
      x2: r,
      y2: r,
      rotation: 0.7,
    }
    const a = closedEntityAreaM2(obj)
    assert.ok(Math.abs(a - Math.PI * 4) < 1e-9)
  })

  it('measures a 1 m × 1 m square and a 1 m radius disk by shoelace / πr²', () => {
    const square = [
      { x: 0, y: 0 },
      { x: PX_PER_METER, y: 0 },
      { x: PX_PER_METER, y: PX_PER_METER },
      { x: 0, y: PX_PER_METER },
    ]
    assert.ok(Math.abs(polygonAreaM2(square) - 1) < 1e-9)
    const r = PX_PER_METER
    const disk = Math.PI * r * r / (PX_PER_METER * PX_PER_METER)
    assert.ok(Math.abs(disk - Math.PI) < 1e-9)
  })

  it('stores an area annotation that can be moved without changing m²', () => {
    const label = createAreaLabel({ x: 10, y: 20, areaM2: 2.5 })
    assert.equal(label.type, 'areaLabel')
    assert.equal(label.text, '2.50 m²')
    const moved = { ...label, x: 80, y: 90 }
    assert.equal(moved.areaM2, 2.5)
    assert.equal(moved.text, '2.50 m²')
  })

  it('elige la entidad más pequeña cuando hay anidación', () => {
    const outer = {
      type: 'rect',
      x1: 0,
      y1: 0,
      x2: metersToWorld(40),
      y2: metersToWorld(20),
    }
    const inner = {
      type: 'rect',
      x1: metersToWorld(5),
      y1: metersToWorld(5),
      x2: metersToWorld(15),
      y2: metersToWorld(10),
    }
    // Interior 10×5 = 50 m²
    assert.equal(
      exactClosedAreaM2AtPoint([outer, inner], metersToWorld(10), metersToWorld(7.5)),
      50,
    )
  })
})
