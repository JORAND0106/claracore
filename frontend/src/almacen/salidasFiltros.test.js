import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_SALIDAS_FILTROS,
  countSalidasFiltrosActivos,
  filterSalidasLista,
  matchSalidaFiltros,
} from './salidasFiltros.js'

const base = {
  id: 5,
  codigo: 'Sal-ABC-00005',
  numero_salida: 5,
  fecha_hora_salida: '2026-06-01T18:00:00Z',
  pk_id: 'PK-88',
  material_descripcion: 'Grava 3/4',
  numero_oc: 15,
  receptor_nombre: 'Luis Mora',
  despachador_nombre: 'Sofía Díaz',
  cantidad_devuelta: 2,
}

describe('filtros salidas', () => {
  it('sin filtros no reduce', () => {
    assert.equal(filterSalidasLista([base], EMPTY_SALIDAS_FILTROS).length, 1)
    assert.equal(countSalidasFiltrosActivos(EMPTY_SALIDAS_FILTROS), 0)
  })

  it('filtra PK, material, OC, receptor y despachador', () => {
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, pk_id: '88' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, material: 'grava' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, numero_oc: '15' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, receptor: 'luis' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, despachador: 'sofia' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, receptor: 'ana' }), false)
  })

  it('filtra devolución y número de salida', () => {
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, con_devolucion: 'si' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, con_devolucion: 'no' }), false)
    assert.equal(matchSalidaFiltros({ ...base, cantidad_devuelta: 0 }, {
      ...EMPTY_SALIDAS_FILTROS,
      con_devolucion: 'no',
    }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, numero_salida: '00005' }), true)
    assert.equal(matchSalidaFiltros(base, { ...EMPTY_SALIDAS_FILTROS, numero_salida: '99' }), false)
  })

  it('combinación sin resultados', () => {
    assert.equal(filterSalidasLista([base], {
      ...EMPTY_SALIDAS_FILTROS,
      pk_id: '88',
      material: 'cemento',
    }).length, 0)
  })
})
