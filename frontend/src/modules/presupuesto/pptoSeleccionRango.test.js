import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { idsRangoSeleccion } from './pptoSeleccionRango.js'

const lista = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
const sellado = (r) => r.id === 3

describe('idsRangoSeleccion', () => {
  it('selecciona el rango inclusivo entre ancla y destino', () => {
    assert.deepEqual(idsRangoSeleccion(lista, 2, 5), [2, 3, 4, 5])
    assert.deepEqual(idsRangoSeleccion(lista, 5, 2), [2, 3, 4, 5])
  })

  it('omite filas selladas', () => {
    assert.deepEqual(idsRangoSeleccion(lista, 1, 5, sellado), [1, 2, 4, 5])
  })

  it('sin ancla válida, solo el destino', () => {
    assert.deepEqual(idsRangoSeleccion(lista, null, 4), [4])
    assert.deepEqual(idsRangoSeleccion(lista, 99, 4), [4])
  })

  it('destino sellado sin ancla → vacío', () => {
    assert.deepEqual(idsRangoSeleccion(lista, null, 3, sellado), [])
  })

  it('compara ids como string (ancla numérica / destino string)', () => {
    assert.deepEqual(idsRangoSeleccion(lista, 2, '4'), [2, 3, 4])
  })

  it('sin omitirFila incluye todas las filas del rango (tab Tramos / competencia)', () => {
    assert.deepEqual(idsRangoSeleccion(lista, 1, 5, () => false), [1, 2, 3, 4, 5])
  })
})
