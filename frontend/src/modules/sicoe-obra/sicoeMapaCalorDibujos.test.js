/**
 * Join mapa de calor ↔ dibujos filtrados (geometría real, sin LOD).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  construirCalorSobreDibujos,
  geometriaDibujoParaPlano,
} from './sicoeMapaCalorDibujos.js'

function heatPoint(id, reporteId, weight, costo = 100, item = '5') {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-74.1, 4.7] },
    properties: {
      id,
      reporte_id: reporteId,
      weight,
      costo_directo: costo,
      numero_registro: id,
      item_numero: item,
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
      item_numero: '5',
    },
  }
}

function dibujoReporte(reporteId, geom = {
  type: 'Polygon',
  coordinates: [[[-74.1, 4.7], [-74.09, 4.7], [-74.09, 4.71], [-74.1, 4.71], [-74.1, 4.7]]],
}, extraProps = {}) {
  return {
    type: 'Feature',
    geometry: geom,
    properties: {
      reporte_id: reporteId,
      origen: 'reporte_dibujo',
      huella_tipo: 'poligono',
      dibujo_tipo: 'poligono',
      ...extraProps,
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
      huella(99, 99),
    ])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.meta.sin_dibujo, 1)
    assert.equal(r.dibujosFc.features[0].properties.weight, 0.8)
    assert.equal(r.dibujosFc.features[0].properties.color_mode, 'calor')
    assert.equal(r.dibujosFc.features[0].properties.registro_id, 1)
    assert.equal(r.dibujosFc.features[0].properties.is_lod_marker, 0)
    assert.ok(r.dibujosFc.features[0].properties.color)
    assert.equal(r.puntosSinDibujoFc.features[0].properties.id, 2)
  })

  it('no arrastra dibujos de otros registros aunque compartan reporte', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 10, 1, 1000)],
    }
    const r = construirCalorSobreDibujos(heat, [
      huella(1, 10),
      huella(2, 10),
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
  })

  it('entidad nodo (polígono) se pinta como polígono, nunca como LOD/punto', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(7, 30, 0.9, 900)],
    }
    const nodo = huella(7, 30)
    nodo.properties.huella_tipo = 'nodo'
    nodo.properties.dibujo_tipo = 'nodo'
    const r = construirCalorSobreDibujos(heat, [nodo])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.meta.sin_dibujo, 0)
    assert.equal(r.dibujosFc.features.length, 1)
    assert.equal(r.dibujosFc.features[0].geometry.type, 'Polygon')
    assert.equal(r.dibujosFc.features[0].properties.is_lod_marker, 0)
    assert.equal(r.puntosSinDibujoFc.features.length, 0)
  })

  it('dibujo del reporte cubre todos los ítems filtrados del reporte', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [
        heatPoint(1, 60, 0.8, 800),
        heatPoint(2, 60, 0.4, 400),
        heatPoint(3, 99, 0.2, 200),
      ],
    }
    const r = construirCalorSobreDibujos(heat, [dibujoReporte(60)])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.meta.sin_dibujo, 1)
    assert.equal(r.puntosSinDibujoFc.features[0].properties.id, 3)
    assert.equal(r.dibujosFc.features[0].geometry.type, 'Polygon')
  })

  it('si el FC trae entidad polígono + Point, solo queda la entidad (no el punto)', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 1, 1, 100)],
    }
    const r = construirCalorSobreDibujos(heat, [
      dibujoReporte(1, {
        type: 'Polygon',
        coordinates: [[[-74.1, 4.7], [-74.09, 4.7], [-74.09, 4.71], [-74.1, 4.71], [-74.1, 4.7]]],
      }, { huella_tipo: 'nodo', dibujo_tipo: 'nodo', es_bloque: true }),
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-74.095, 4.705] },
        properties: {
          reporte_id: 1,
          origen: 'reporte_dibujo',
          huella_tipo: 'nodo',
          dibujo_tipo: 'nodo',
        },
      },
    ])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.dibujosFc.features[0].geometry.type, 'Polygon')
    assert.equal(r.meta.sin_dibujo, 0)
  })

  it('Point solo (sin entidad) se expande a polígono disco, no a marcador LOD', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 8, 0.7, 700)],
    }
    const r = construirCalorSobreDibujos(heat, [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-74.1, 4.7] },
      properties: {
        reporte_id: 8,
        origen: 'reporte_dibujo',
        huella_tipo: 'nodo',
        dibujo_tipo: 'nodo',
      },
    }])
    assert.equal(r.meta.con_dibujo, 1)
    assert.equal(r.dibujosFc.features[0].geometry.type, 'Polygon')
    assert.equal(r.dibujosFc.features[0].properties.is_lod_marker, 0)
    assert.equal(r.dibujosFc.features[0].properties.geometria_origen, 'point_expandido')
    assert.equal(r.meta.sin_dibujo, 0)
  })

  it('línea del reporte se conserva como LineString', () => {
    const heat = {
      type: 'FeatureCollection',
      features: [heatPoint(1, 12, 1, 500)],
    }
    const r = construirCalorSobreDibujos(heat, [
      dibujoReporte(12, {
        type: 'LineString',
        coordinates: [[-74.1, 4.7], [-74.09, 4.71]],
      }, { huella_tipo: 'linea', dibujo_tipo: 'linea' }),
    ])
    assert.equal(r.dibujosFc.features[0].geometry.type, 'LineString')
    assert.equal(r.meta.sin_dibujo, 0)
  })
})

describe('geometriaDibujoParaPlano', () => {
  it('Polygon intacto', () => {
    const g = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    const r = geometriaDibujoParaPlano(g)
    assert.equal(r.geometry.type, 'Polygon')
  })

  it('Point → Polygon disco', () => {
    const r = geometriaDibujoParaPlano({ type: 'Point', coordinates: [-74.1, 4.7] })
    assert.equal(r.geometry.type, 'Polygon')
    assert.ok(r.geometry.coordinates[0].length > 8)
  })
})
