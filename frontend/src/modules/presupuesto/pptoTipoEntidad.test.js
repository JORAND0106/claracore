import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparRegistrosPorTipoEntidad,
  clasificarTipoEntidad,
} from './pptoTipoEntidad.js'

describe('clasificarTipoEntidad', () => {
  it('clasifica Área / Longitud / Unidad con variantes', () => {
    assert.equal(clasificarTipoEntidad('Área'), 'area')
    assert.equal(clasificarTipoEntidad('Hatch'), 'area')
    assert.equal(clasificarTipoEntidad('Longitud/Tramo'), 'longitud')
    assert.equal(clasificarTipoEntidad('Polyline'), 'longitud')
    assert.equal(clasificarTipoEntidad('Nodo'), 'unidad')
    assert.equal(clasificarTipoEntidad('Nodo RSP'), 'unidad')
  })

  it('devuelve null si vacío o desconocido', () => {
    assert.equal(clasificarTipoEntidad(''), null)
    assert.equal(clasificarTipoEntidad(null), null)
    assert.equal(clasificarTipoEntidad('xyz'), null)
  })
})

describe('agruparRegistrosPorTipoEntidad', () => {
  it('ordena Área → Longitud → Unidad y omite vacíos', () => {
    const groups = agruparRegistrosPorTipoEntidad([
      { id: 1, tipo_entidad: 'Nodo' },
      { id: 2, tipo_entidad: 'Área' },
      { id: 3, tipo_entidad: 'Longitud' },
      { id: 4, tipo_entidad: 'Área' },
    ])
    assert.deepEqual(groups.map((g) => g.key), ['area', 'longitud', 'unidad'])
    assert.deepEqual(groups.map((g) => g.colLabel), ['Área', 'Longitud', 'Unidad'])
    assert.equal(groups[0].registros.length, 2)
    assert.equal(groups[1].registros.length, 1)
    assert.equal(groups[2].registros.length, 1)
  })

  it('no genera subtabla ausente y manda sin clasificar a residual', () => {
    const groups = agruparRegistrosPorTipoEntidad([
      { id: 1, tipo_entidad: 'Longitud' },
      { id: 2, tipo_entidad: '' },
    ])
    assert.deepEqual(groups.map((g) => g.key), ['longitud', 'otros'])
    assert.equal(groups[1].colLabel, 'Área/Long/Nodo')
  })
})
