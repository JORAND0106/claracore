/**
 * Tests conversión escena esquema → GeoJSON huella.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { metersToWorld } from '../../components/esquema/esquemaGeometry.js'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
  originLngLatPreferGauss,
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

  it('polígono de secuencia de unión (closed sin repetir primer punto) → Polygon', () => {
    const w = metersToWorld(8)
    const fc = esquemaSceneToGeojson(
      [
        { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
        { id: 'n2', type: 'nodo', nodeNum: '2', x: w, y: 0 },
        { id: 'n3', type: 'nodo', nodeNum: '3', x: w, y: w },
        { id: 'n4', type: 'nodo', nodeNum: '4', x: 0, y: w },
        {
          id: 'jp1',
          type: 'polilinea',
          closed: true,
          fromJoinSequence: true,
          points: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: w },
            { x: 0, y: w },
          ],
        },
      ],
      origin,
      { dibujoTipo: 'poligono', reporteId: 62 },
    )
    assert.ok(fc.features.some((f) => f.geometry.type === 'Polygon'))
    const feat = featureHuellaDesdeDibujo(fc, { reporte_id: 62, dibujo_tipo: 'poligono' })
    assert.equal(feat.geometry.type, 'Polygon')
    assert.equal(feat.properties.huella_tipo, 'poligono')
  })

  it('originLngLatPreferGauss usa nodos aunque origin_lnglat esté desplazado', () => {
    const norte = 970815.977
    const este = 957380.723
    const wrong = { lng: -74.1, lat: 4.6 }
    const got = originLngLatPreferGauss({
      origin_lnglat: wrong,
      objects: [{ type: 'nodo', x: 0, y: 0, norte, este }],
    })
    assert.ok(got)
    assert.notEqual(got.lng, wrong.lng)
    // Debe coincidir con world(0,0) → GK del nodo
    const atNode = worldPointToLngLat(0, 0, got)
    assert.ok(Math.abs(atNode[0] - got.lng) < 1e-12)
    assert.ok(Math.abs(atNode[1] - got.lat) < 1e-12)
  })
})
