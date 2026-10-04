/**
 * Join mapa de calor ↔ dibujos filtrados.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { construirCalorSobreDibujos } from './sicoeMapaCalorDibujos.js'

function heatPoint(id, reporteId, weight, costo = 100) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-74.1, 4.7] },
    properties: {
      id,
      reporte_id: reporteId,
      weight,
      costo_directo: costo,
      numero_registro: id,
    },
  }
}

function huella(registroId, reporteId, geom = {
  type: 'Polygon',
  coordinates: [[[-74.1, 4.7], [-74.09, 4.7], [-74.09, 4.71], [-74.1, 4.71], [-74.1, 4.7]]],
}) {
  return {
    type: 'Feature',
    geometry: geom,
    properties: {
      registro_id: registroId,
      reporte_id: reporteId,
      huella_tipo: 'poligono',
    },
  }
}

describe('construirCalorSobreDibujos', () => {
  it('sin puntos de calor → colecciones vacías', () => {
    const r = construirCalorSobreDibujos(
      { type: 'FeatureCollection', features: [] },
      [huella(1, 10)],
    )
    assert.equal(r.dibujosFc.features.length, 0)
    assert.equal(r.puntosSinDibujoFc.features.length, 0)
    assert.equal(r.meta.con_dibujo, 0)
    assert.equal(r.meta.sin_dibujo, 0)
  })

  it('pinta calor sobre el dibujo del registro filtrado y omite el punto GPS', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 10, 0.8, 800), heatPoint(2, 10, 0.4, 400)],
    }
    const r = construirCalorSobreDibujos(heat, [
      huella(1, 10),
      huella(99, 99), // no filtrado
    ])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.meta.sin_dibujo, 1)
    assert.equal(r.dibujosFc.features[0].properties.weight, 0.8)
    assert.equal(r.dibujosFc.features[0].properties.color_mode, 'calor')
    assert.equal(r.dibujosFc.features[0].properties.registro_id, 1)
    assert.equal(r.puntosSinDibujoFc.features.length, 1)
    assert.equal(r.puntosSinDibujoFc.features[0].properties.id, 2)
    assert.equal(r.puntosSinDibujoFc.features[0].properties.sin_dibujo, 1)
  })

  it('no arrastra dibujos de otros registros aunque compartan reporte', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 10, 1, 1000)],
    }
    const r = construirCalorSobreDibujos(heat, [
      huella(1, 10),
      huella(2, 10), // mismo reporte, otro registro no filtrado
    ])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.dibujosFc.features[0].properties.registro_id, 1)
  })

  it('registro filtrado sin huella queda como punto sin dibujo', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(5, 20, 0.5, 50)],
    }
    const r = construirCalorSobreDibujos(heat, [huella(1, 10)])
    assert.equal(r.meta.con_dibujo, 0)
    assert.equal(r.meta.sin_dibujo, 1)
    assert.equal(r.puntosSinDibujoFc.features[0].properties.id, 5)
  })

  it('añade marcador LOD para nodos polígono', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(7, 30, 0.9, 900)],
    }
    const nodo = huella(7, 30)
    nodo.properties.huella_tipo = 'nodo'
    const r = construirCalorSobreDibujos(heat, [nodo])
    assert.equal(r.meta.con_dibujo, 1)
    const lod = r.dibujosFc.features.filter((f) => f.properties.is_lod_marker === 1)
    assert.equal(lod.length, 1)
    assert.equal(lod[0].geometry.type, 'Point')
  })
})
