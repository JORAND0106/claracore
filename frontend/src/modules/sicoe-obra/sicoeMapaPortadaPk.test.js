import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sicoeDatosMapaPortadaPk } from './sicoeMapaPortadaPk.js'

/** Plano sintético: PK 525254 + abscisas 1900–2400 y otro PK distinto. */
function planoPrueba() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Layer: '525254', PK_ID: '525254' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-74.0500, 4.7100],
            [-74.0490, 4.7100],
            [-74.0490, 4.7110],
            [-74.0500, 4.7110],
            [-74.0500, 4.7100],
          ]],
        },
      },
      {
        type: 'Feature',
        properties: { Layer: '999001' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-74.0600, 4.7200],
            [-74.0590, 4.7200],
            [-74.0590, 4.7210],
            [-74.0600, 4.7210],
            [-74.0600, 4.7200],
          ]],
        },
      },
      { type: 'Feature', properties: { etiqueta: '1+900.00' }, geometry: { type: 'Point', coordinates: [-74.0498, 4.7102] } },
      { type: 'Feature', properties: { etiqueta: '1+964.00' }, geometry: { type: 'Point', coordinates: [-74.0496, 4.7104] } },
      { type: 'Feature', properties: { etiqueta: '2+000.00' }, geometry: { type: 'Point', coordinates: [-74.0494, 4.7105] } },
      { type: 'Feature', properties: { etiqueta: '2+328.00' }, geometry: { type: 'Point', coordinates: [-74.0492, 4.7107] } },
      { type: 'Feature', properties: { etiqueta: '2+400.00' }, geometry: { type: 'Point', coordinates: [-74.0491, 4.7108] } },
      { type: 'Feature', properties: { etiqueta: '5+000.00' }, geometry: { type: 'Point', coordinates: [-74.0595, 4.7205] } },
    ],
  }
}

describe('sicoeDatosMapaPortadaPk', () => {
  it('incluye el polígono del PK_ID 525254 y no el de otro PK', () => {
    const { planoFc, bounds } = sicoeDatosMapaPortadaPk(planoPrueba(), '525254', 1964, 2328)
    const polys = planoFc.features.filter((f) => f.geometry.type === 'Polygon')
    assert.equal(polys.length, 1)
    assert.equal(polys[0].properties.pk_id, '525254')
    assert.ok(bounds)
    assert.ok(Math.abs(bounds.minLng - (-74.05)) < 1e-6)
  })

  it('incluye puntos de abscisa cercanos al polígono del PK', () => {
    const { planoFc } = sicoeDatosMapaPortadaPk(planoPrueba(), '525254', 1964, 2328)
    const etiquetas = planoFc.features
      .filter((f) => f.geometry.type === 'Point')
      .map((f) => f.properties.etiqueta)
    assert.ok(etiquetas.includes('1+964.00'))
    assert.ok(etiquetas.includes('2+328.00'))
    assert.ok(!etiquetas.includes('5+000.00'))
  })

  it('calcula extremos Abs. Inicio / Abs. Final sobre el eje', () => {
    const { extremos } = sicoeDatosMapaPortadaPk(planoPrueba(), '525254', 1964, 2328)
    assert.equal(extremos.length, 2)
    assert.equal(extremos[0].rol, 'inicio')
    assert.ok(String(extremos[0].label).includes('1964'))
    assert.equal(extremos[1].rol, 'final')
    assert.ok(String(extremos[1].label).includes('2328'))
    assert.ok(Number.isFinite(extremos[0].lng))
    assert.ok(Number.isFinite(extremos[1].lat))
  })

  it('funciona con un PK distinto (999001)', () => {
    const { planoFc, extremos } = sicoeDatosMapaPortadaPk(planoPrueba(), '999001', 5000, 5000)
    const polys = planoFc.features.filter((f) => f.geometry.type === 'Polygon')
    assert.equal(polys.length, 1)
    assert.equal(polys[0].properties.pk_id, '999001')
    assert.ok(extremos.some((e) => e.rol === 'inicio'))
  })

  it('devuelve vacío si no hay PK o plano', () => {
    assert.equal(sicoeDatosMapaPortadaPk(null, '525254', 1, 2).planoFc.features.length, 0)
    assert.equal(sicoeDatosMapaPortadaPk(planoPrueba(), '', 1, 2).planoFc.features.length, 0)
  })
})
