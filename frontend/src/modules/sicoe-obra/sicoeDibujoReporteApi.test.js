import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { reporteTieneDibujo, reporteSinDibujo } from './sicoeDibujoReporteApi.js'

describe('reporteTieneDibujo / reporteSinDibujo', () => {
  it('respeta flag tiene_dibujo del backend', () => {
    assert.equal(reporteTieneDibujo({ tiene_dibujo: true }), true)
    assert.equal(reporteSinDibujo({ tiene_dibujo: true }), false)
    assert.equal(reporteSinDibujo({ tiene_dibujo: false }), true)
  })

  it('detecta FeatureCollection con features', () => {
    const rep = {
      dibujo_geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
    }
    assert.equal(reporteTieneDibujo(rep), true)
    assert.equal(reporteSinDibujo(rep), false)
  })

  it('FeatureCollection vacía = sin dibujo', () => {
    assert.equal(
      reporteTieneDibujo({ dibujo_geojson: { type: 'FeatureCollection', features: [] } }),
      false,
    )
  })

  it('acepta perimetro_geojson como fallback', () => {
    assert.equal(
      reporteTieneDibujo({
        perimetro_geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } },
      }),
      true,
    )
  })
})
