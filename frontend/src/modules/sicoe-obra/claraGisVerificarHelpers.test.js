import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clasificarUnidadItem,
  clasificarTipoDibujo,
  compararCantidadConDibujo,
  longitudLineaM,
  areaPoligonoM2,
  indiceSiguientePendiente,
  fmtCantidadVerificar,
  lineaItemVerificar,
  puedeMostrarBotonesValidacion,
  fmtAbscisaCostado,
  buildSlidesMediaVerificar,
} from './claraGisVerificarHelpers.js'

describe('clasificarUnidadItem', () => {
  it('detecta longitud y área', () => {
    assert.equal(clasificarUnidadItem('m'), 'longitud')
    assert.equal(clasificarUnidadItem('ML'), 'longitud')
    assert.equal(clasificarUnidadItem('m²'), 'area')
    assert.equal(clasificarUnidadItem('M2'), 'area')
    assert.equal(clasificarUnidadItem('m³'), 'otro')
    assert.equal(clasificarUnidadItem('Kg'), 'otro')
    assert.equal(clasificarUnidadItem('und'), 'otro')
  })
})

describe('clasificarTipoDibujo', () => {
  it('prioriza línea sobre polígono', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-74, 4], [-74.001, 4]] },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-74, 4], [-74.001, 4], [-74.001, 4.001], [-74, 4]]],
          },
          properties: {},
        },
      ],
    }
    assert.equal(clasificarTipoDibujo(fc), 'linea')
  })

  it('nodo bloque no cuenta como polígono de área', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-74, 4], [-74.0001, 4], [-74.0001, 4.0001], [-74, 4]]],
        },
        properties: { dibujo_tipo: 'nodo', es_bloque: true },
      }],
    }
    assert.equal(clasificarTipoDibujo(fc), 'nodo')
  })
})

describe('medir geometrías', () => {
  it('longitud línea > 0', () => {
    const L = longitudLineaM({
      type: 'LineString',
      coordinates: [[-74.0, 4.0], [-74.0, 4.001]],
    })
    assert.ok(L > 100 && L < 120)
  })

  it('área polígono > 0', () => {
    const A = areaPoligonoM2({
      type: 'Polygon',
      coordinates: [[
        [-74.0, 4.0],
        [-74.001, 4.0],
        [-74.001, 4.001],
        [-74.0, 4.001],
        [-74.0, 4.0],
      ]],
    })
    assert.ok(A > 10000)
  })
})

describe('compararCantidadConDibujo', () => {
  it('línea + m → comparación; nodo no muestra nada', () => {
    const line = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[-74.0, 4.0], [-74.0, 4.001]],
        },
        properties: {},
      }],
    }
    const ok = compararCantidadConDibujo(
      { cantidad_total: 111, unidad: 'm' },
      line,
    )
    assert.ok(ok)
    assert.equal(typeof ok.texto, 'string')
    assert.match(ok.texto, /Dibujo:/)

    const nodo = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-74, 4] },
        properties: { dibujo_tipo: 'nodo' },
      }],
    }
    assert.equal(compararCantidadConDibujo({ cantidad_total: 1, unidad: 'und' }, nodo), null)
    assert.equal(compararCantidadConDibujo({ cantidad_total: 10, unidad: 'm²' }, line), null)
  })

  it('diferencia > 5 % → no ok', () => {
    const poly = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-74.0, 4.0],
          [-74.001, 4.0],
          [-74.001, 4.001],
          [-74.0, 4.001],
          [-74.0, 4.0],
        ]],
      },
      properties: { dibujo_tipo: 'poligono' },
    }
    const r = compararCantidadConDibujo({ cantidad_total: 1, unidad: 'm²' }, poly)
    assert.ok(r)
    assert.equal(r.ok, false)
    assert.match(r.texto, /Δ/)
  })
})

describe('navegación pendiente', () => {
  it('salta al siguiente No Revisado validable', () => {
    const regs = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]
    const estadoMiNivel = (r) => (r.id === 2 ? 'No Revisado' : 'Aprobado')
    const puedeValidar = (r) => r.id !== 1
    assert.equal(indiceSiguientePendiente(regs, 0, { estadoMiNivel, puedeValidar }), 1)
    assert.equal(indiceSiguientePendiente(regs, 1, { estadoMiNivel, puedeValidar }), 1)
  })
})

describe('formato ficha', () => {
  it('línea ítem y cantidad con unidad', () => {
    assert.equal(
      lineaItemVerificar({ item_numero: 'NP-01', item_descripcion: 'Geotextil' }),
      'NP-01 · Geotextil',
    )
    const cant = fmtCantidadVerificar({
      longitud: 25,
      ancho: 3.5,
      cantidad_total: 87.5,
      unidad: 'm²',
    })
    assert.match(cant, /25/)
    assert.match(cant, /87/)
    assert.match(cant, /m²/)
  })
})

describe('puedeMostrarBotonesValidacion', () => {
  it('solo No Revisado / Pendiente y validable', () => {
    const reg = { id: 1, bloqueado: false }
    assert.equal(
      puedeMostrarBotonesValidacion(reg, {
        puedeValidarRapido: () => true,
        estadoMiNivel: () => 'Aprobado',
      }),
      false,
    )
    assert.equal(
      puedeMostrarBotonesValidacion(reg, {
        puedeValidarRapido: () => true,
        estadoMiNivel: () => 'No Revisado',
      }),
      true,
    )
    assert.equal(
      puedeMostrarBotonesValidacion({ ...reg, bloqueado: true }, {
        puedeValidarRapido: () => true,
        estadoMiNivel: () => 'No Revisado',
      }),
      false,
    )
  })
})

describe('fmtAbscisaCostado / slides', () => {
  it('formatea abscisa y arma slides foto+grafico', () => {
    assert.match(
      fmtAbscisaCostado({ abs_inicio: '1+200', abs_final: '1+250', margen: 'Izquierdo' }),
      /1\+200/,
    )
    const slides = buildSlidesMediaVerificar(
      [{ url: 'a.jpg', numero: 1 }],
      [{ url: 'b.png', numero: 2 }],
    )
    assert.equal(slides.length, 2)
    assert.equal(slides[0].tipo, 'foto')
    assert.equal(slides[1].tipo, 'grafico')
  })
})
