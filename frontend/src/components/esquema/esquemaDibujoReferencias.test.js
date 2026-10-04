import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDibujoReferenciasFeatureCollection,
  ESQUEMA_DIBUJO_REFS_COLOR,
} from '../../components/esquema/esquemaDibujoReferencias.js'

describe('buildDibujoReferenciasFeatureCollection', () => {
  it('expande features con props de reporte', () => {
    const fc = buildDibujoReferenciasFeatureCollection([
      {
        reporte_id: 20,
        numero_reporte: 7,
        items: ['1.1', '2.2'],
        costo_directo: 1500,
        dibujo_geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-74, 4] },
              properties: { foo: 1 },
            },
          ],
        },
      },
      {
        reporte_id: 21,
        numero_reporte: 8,
        items: ['1.1'],
        costo_directo: 0,
        dibujo_geojson: { type: 'FeatureCollection', features: [] },
      },
    ])
    assert.equal(fc.type, 'FeatureCollection')
    assert.equal(fc.features.length, 1)
    const p = fc.features[0].properties
    assert.equal(p.ref_reporte_id, 20)
    assert.equal(p.ref_numero_reporte, 7)
    assert.equal(p.ref_items, '1.1, 2.2')
    assert.equal(p.ref_costo_directo, 1500)
    assert.equal(p.ref_readonly, 1)
    assert.equal(p.foo, 1)
  })

  it('acepta Feature suelta', () => {
    const fc = buildDibujoReferenciasFeatureCollection([
      {
        reporte_id: 1,
        numero_reporte: 1,
        items: [],
        costo_directo: 0,
        dibujo_geojson: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: {},
        },
      },
    ])
    assert.equal(fc.features.length, 1)
    assert.equal(fc.features[0].geometry.type, 'Polygon')
  })

  it('exporta color de referencia', () => {
    assert.equal(typeof ESQUEMA_DIBUJO_REFS_COLOR, 'string')
    assert.ok(ESQUEMA_DIBUJO_REFS_COLOR.startsWith('#'))
  })
})
