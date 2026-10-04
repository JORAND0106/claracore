import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDibujoReferenciasFeatureCollection,
  geojsonParaReferencia,
  infoFromReferenciaFeatureProps,
  ESQUEMA_DIBUJO_REFS_COLOR,
} from '../../components/esquema/esquemaDibujoReferencias.js'
import { metersToWorld } from '../../components/esquema/esquemaGeometry.js'

describe('buildDibujoReferenciasFeatureCollection', () => {
  it('expande features con props de reporte', () => {
    const fc = buildDibujoReferenciasFeatureCollection([
      {
        reporte_id: 20,
        numero_reporte: 7,
        items: ['1.1', '2.2'],
        costo_directo: 1500,
        registros: [
          { numero_registro: 3, item_numero: '1.1' },
          { numero_registro: 4, item_numero: '2.2' },
        ],
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
    const regs = JSON.parse(p.ref_registros_json)
    assert.equal(regs.length, 2)
    assert.equal(regs[0].numero_registro, 3)
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

  it('usa escena detallada en lugar del bbox genérico', () => {
    const w = metersToWorld(2)
    const h = metersToWorld(1)
    const ref = {
      reporte_id: 9,
      numero_reporte: 12,
      items: ['A'],
      costo_directo: 10,
      registros: [{ numero_registro: 1, item_numero: 'A' }],
      // GeoJSON simplificado (bbox) — no debería usarse si hay escena
      dibujo_geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-74, 4], [-73.9, 4], [-73.9, 4.1], [-74, 4], [-74, 4]]],
            },
            properties: { es_entidad: true },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-74, 4] },
            properties: { lod_marker: true },
          },
        ],
      },
      dibujo_escena: {
        version: 3,
        dibujo_tipo: 'nodo',
        origin_lnglat: { lng: -74.08, lat: 4.65 },
        objects: [
          { id: 'n1', type: 'nodo', x: 0, y: 0, nodeNum: '1' },
          {
            id: 'b1',
            type: 'bloque',
            x: -w / 2,
            y: -h / 2,
            w,
            h,
            rotation: 0,
            children: [
              { type: 'elipse', x1: 0, y1: 0, x2: w, y2: h },
              {
                type: 'linea',
                x1: 0,
                y1: h / 2,
                x2: w,
                y2: h / 2,
              },
            ],
          },
        ],
      },
    }
    const detailed = geojsonParaReferencia(ref)
    assert.ok(detailed.features.length >= 2)
    assert.ok(detailed.features.some((f) => f.geometry.type === 'Polygon'))
    assert.ok(detailed.features.some((f) => f.geometry.type === 'LineString'))
    assert.ok(detailed.features.some((f) => f.geometry.type === 'Point'))
    // Elipse aproximada ≠ bbox de 4 esquinas del geojson simplificado
    const poly = detailed.features.find((f) => f.geometry.type === 'Polygon')
    assert.ok(poly.geometry.coordinates[0].length > 5)

    const fc = buildDibujoReferenciasFeatureCollection([ref])
    assert.ok(fc.features.length >= 2)
    assert.equal(fc.features[0].properties.ref_reporte_id, 9)
  })

  it('exporta color de referencia', () => {
    assert.equal(typeof ESQUEMA_DIBUJO_REFS_COLOR, 'string')
    assert.ok(ESQUEMA_DIBUJO_REFS_COLOR.startsWith('#'))
  })

  it('infoFromReferenciaFeatureProps incluye registros', () => {
    const info = infoFromReferenciaFeatureProps({
      ref_reporte_id: 5,
      ref_numero_reporte: 2,
      ref_items: '1.1, 2.2',
      ref_costo_directo: 99,
      ref_registros_json: JSON.stringify([
        { numero_registro: 8, item_numero: '1.1' },
      ]),
    })
    assert.equal(info.reporte_id, 5)
    assert.equal(info.registros.length, 1)
    assert.equal(info.registros[0].numero_registro, 8)
  })
})
