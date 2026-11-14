import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLARAGIS_OSNAP_PX_MOUSE,
  CLARAGIS_OSNAP_PX_TOUCH,
  claragisCentroideLngLat,
  claragisDeduplicarHitsPorReporte,
  claragisFeatureOsnapValida,
  claragisHitsAOpcionesPicker,
  claragisOsnapBbox,
  claragisOsnapTolerancePx,
} from './claraGisOsnapSeleccion.js'

describe('claraGisOsnapSeleccion', () => {
  it('tolerancia mayor en táctil', () => {
    assert.equal(claragisOsnapTolerancePx({ touch: false }), CLARAGIS_OSNAP_PX_MOUSE)
    assert.equal(claragisOsnapTolerancePx({ touch: true }), CLARAGIS_OSNAP_PX_TOUCH)
    assert.equal(claragisOsnapTolerancePx({ coarsePointer: true }), CLARAGIS_OSNAP_PX_TOUCH)
  })

  it('bbox centrado en el punto', () => {
    assert.deepEqual(claragisOsnapBbox({ x: 100, y: 50 }, 10), [[90, 40], [110, 60]])
  })

  it('dedupe por reporte prefiere huella y mayor weight', () => {
    const feats = [
      {
        layer: { id: 'sicoe-calor-puntos' },
        source: 'sicoe-calor',
        properties: { reporte_id: 1, numero_reporte: 10, weight: 0.9, id: 1 },
      },
      {
        layer: { id: 'sicoe-huellas-line' },
        source: 'sicoe-huellas',
        properties: {
          reporte_id: 1, numero_reporte: 10, weight: 0.2, color_mode: 'calor', id: 2,
        },
      },
      {
        layer: { id: 'sicoe-huellas-line' },
        source: 'sicoe-huellas',
        properties: {
          reporte_id: 2, numero_reporte: 11, weight: 0.5, color_mode: 'calor', id: 3,
          descripcion_actividad: 'Excavación tramo A',
        },
      },
      {
        layer: { id: 'sicoe-huellas-fill' },
        source: 'sicoe-huellas',
        properties: { reporte_id: 3, color_mode: 'otro', id: 4 },
      },
    ]
    assert.equal(claragisFeatureOsnapValida(feats[3]), false)
    const uniq = claragisDeduplicarHitsPorReporte(feats)
    assert.equal(uniq.length, 2)
    assert.equal(uniq[0].properties.reporte_id, 1)
    assert.equal(uniq[0].layer.id, 'sicoe-huellas-line')
    const opts = claragisHitsAOpcionesPicker(feats)
    assert.equal(opts.length, 2)
    assert.match(opts[1].descripcion, /Excavación/)
  })

  it('centroide de línea', () => {
    const c = claragisCentroideLngLat({
      type: 'LineString',
      coordinates: [[-74, 4], [-74, 6]],
    })
    assert.deepEqual(c, [-74, 5])
  })
})
