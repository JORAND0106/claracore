/**
 * Tests conversión escena esquema → GeoJSON huella.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { metersToWorld } from '../../components/esquema/esquemaGeometry.js'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
  worldPointToLngLat,
} from './sicoeDibujoEscenaGeojson.js'

describe('sicoeDibujoEscenaGeojson', () => {
  const origin = { lng: -74.08, lat: 4.65 }

  it('worldPointToLngLat: +X este, +Y sur', () => {
    const east100 = worldPointToLngLat(metersToWorld(100), 0, origin)
    assert.ok(east100[0] > origin.lng)
    assert.ok(Math.abs(east100[1] - origin.lat) < 1e-6)
    const south50 = worldPointToLngLat(0, metersToWorld(50), origin)
    assert.ok(south50[1] < origin.lat)
  })

  it('rectángulo cerrado produce Feature Polygon', () => {
    const w = metersToWorld(10)
    const fc = esquemaSceneToGeojson(
      [{ id: 'r1', type: 'rect', x1: 0, y1: 0, x2: w, y2: w }],
      origin,
      { reporteId: 9 },
    )
    assert.equal(fc.features.length, 1)
    assert.equal(fc.features[0].geometry.type, 'Polygon')
    assert.equal(fc.features[0].properties.origen, 'reporte_dibujo')
    const feat = featureHuellaDesdeDibujo(fc, { reporte_id: 9 })
    assert.equal(feat.geometry.type, 'Polygon')
    assert.equal(feat.properties.huella_tipo, 'poligono')
  })

  it('polilínea abierta no genera feature', () => {
    const fc = esquemaSceneToGeojson(
      [{
        type: 'polilinea',
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: metersToWorld(5), y: 0 },
          { x: metersToWorld(5), y: metersToWorld(5) },
        ],
      }],
      origin,
    )
    assert.equal(fc.features.length, 0)
  })
})
