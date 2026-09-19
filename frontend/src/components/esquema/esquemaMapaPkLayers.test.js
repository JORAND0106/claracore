import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESQUEMA_MAPA_PK_SELECTED,
  boundsFromFeatureCollection,
  boundsForSelectedPk,
  buildEsquemaPlanoFc,
  featurePkId,
  normalizeMapContext,
  queryPkYAbscisaEnPunto,
} from './esquemaMapaPkLayers.js'

describe('normalizeMapContext', () => {
  it('detecta PK y punto desde aliases de registro', () => {
    const ctx = normalizeMapContext({
      coord_lat: 4.5,
      coord_lng: -74.1,
      pk_id: '525254',
      abs_inicio: '10+000',
      abs_final: '10+100',
    })
    assert.equal(ctx.hasPk, true)
    assert.equal(ctx.hasPoint, true)
    assert.equal(ctx.pkId, '525254')
    assert.equal(ctx.lat, 4.5)
    assert.equal(ctx.lng, -74.1)
  })

  it('sin PK ni punto → vista general', () => {
    const ctx = normalizeMapContext(null)
    assert.equal(ctx.hasPk, false)
    assert.equal(ctx.hasPoint, false)
    assert.equal(ctx.pkId, '')
  })
})

describe('featurePkId / plano FC', () => {
  it('lee PK_ID / Layer', () => {
    assert.equal(featurePkId({ properties: { PK_ID: '12' } }), '12')
    assert.equal(featurePkId({ properties: { Layer: 'AB' } }), 'AB')
  })

  it('separa polígonos y abscisas', () => {
    const fc = buildEsquemaPlanoFc({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { PK_ID: '1' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
        },
        {
          type: 'Feature',
          properties: { etiqueta: '10+000' },
          geometry: { type: 'Point', coordinates: [0.5, 0.5] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [2, 2] },
        },
      ],
    })
    assert.equal(fc.features.length, 2)
    assert.equal(featurePkId(fc.features[0]), '1')
  })
})

describe('bounds y consulta clic', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { pk_id: 'A' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-74.1, 4.5], [-74.09, 4.5], [-74.09, 4.51], [-74.1, 4.51], [-74.1, 4.5]]],
        },
      },
      {
        type: 'Feature',
        properties: { pk_id: 'B' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-75, 5], [-74.9, 5], [-74.9, 5.1], [-75, 5.1], [-75, 5]]],
        },
      },
      {
        type: 'Feature',
        properties: { etiqueta: '12+500' },
        geometry: { type: 'Point', coordinates: [-74.095, 4.505] },
      },
    ],
  }

  it('bounds del contrato y del PK', () => {
    const all = boundsFromFeatureCollection(fc)
    assert.ok(all)
    assert.ok(all[0] < all[2])
    const bA = boundsForSelectedPk(fc, 'A')
    assert.ok(bA)
    assert.ok(bA[0] > -74.11 && bA[0] < -74.08)
    assert.equal(boundsForSelectedPk(fc, 'Z'), null)
  })

  it('consulta PK + abscisa cercana', () => {
    const q = queryPkYAbscisaEnPunto(fc, -74.095, 4.505, 'A')
    assert.equal(q.pkId, 'A')
    assert.equal(q.abscisa, '12+500')
    assert.equal(ESQUEMA_MAPA_PK_SELECTED, '#F59E0B')
  })
})
