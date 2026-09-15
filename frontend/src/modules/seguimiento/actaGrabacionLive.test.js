import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergeTemasGrabacionViva } from './actaGrabacionLive.js'

describe('mergeTemasGrabacionViva', () => {
  it('inserta temas sintetizados sin tocar compromisos', () => {
    const ideas = [{ _key: 'i1', texto: '<p></p>', titulo: '', quien_dijo: '', imagenes: [] }]
    const next = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Avance de obra', texto: 'Se revisó el avance del tramo norte.', interviniente: 'Ana' },
    ], { newRowKey: () => 'k2' })
    assert.equal(next.length, 1)
    assert.equal(next[0]._claveGrabacion, 't1')
    assert.equal(next[0].titulo, 'Avance de obra')
    assert.match(next[0].texto, /avance del tramo norte/i)
    assert.equal(next[0].quien_dijo, 'Ana')
  })

  it('actualiza por clave y respeta edición manual', () => {
    const ideas = [{
      _key: 'i1',
      _claveGrabacion: 't1',
      titulo: 'Viejo',
      texto: '<p>Viejo</p>',
      quien_dijo: '',
      imagenes: [],
    }]
    const updated = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Nuevo', texto: 'Texto nuevo', interviniente: null },
    ])
    assert.equal(updated[0].titulo, 'Nuevo')

    const locked = [{ ...ideas[0], _editadoUsuario: true, titulo: 'Manual' }]
    const kept = mergeTemasGrabacionViva(locked, [
      { clave: 't1', titulo: 'IA', texto: 'No debe pisar', interviniente: null },
    ])
    assert.equal(kept[0].titulo, 'Manual')
  })

  it('agrega tema nuevo sin borrar existentes', () => {
    const ideas = [{
      _key: 'i1',
      _claveGrabacion: 't1',
      titulo: 'Uno',
      texto: '<p>Uno</p>',
      quien_dijo: '',
      imagenes: [],
    }]
    const next = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Uno', texto: 'Uno', interviniente: null },
      { clave: 't2', titulo: 'Dos', texto: 'Segundo tema', interviniente: null },
    ], { newRowKey: () => 'i2' })
    assert.equal(next.length, 2)
    assert.equal(next[1]._claveGrabacion, 't2')
  })
})
