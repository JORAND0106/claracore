import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  agregarTemaManual,
  abrirTemaEnIdeas,
  cerrarTemaEnIdeas,
  claveOrdenDia,
  claveTemaActivo,
  seedIdeasFromOrdenDia,
  temasBaseDesdeIdeas,
} from './actaTemasOrdenDia.js'

describe('actaTemasOrdenDia', () => {
  it('pre-crea temas cerrados desde el Orden del Día', () => {
    const next = seedIdeasFromOrdenDia(
      [
        { texto: 'Avance de obra', expositor_nombre: 'Ana' },
        { texto: 'Calidad', expositor_nombre: 'Luis' },
      ],
      [{ _key: 'empty', texto: '', titulo: '', quien_dijo: '' }],
      { newRowKey: () => 'k1' },
    )
    assert.equal(next.length, 2)
    assert.equal(next[0]._claveGrabacion, 'od-1')
    assert.equal(next[0].titulo, 'Avance de obra')
    assert.equal(next[0].quien_dijo, 'Ana')
    assert.equal(next[0]._temaAbierto, false)
    assert.equal(next[0]._desdeOrdenDia, true)
    assert.equal(next[1]._claveGrabacion, 'od-2')
  })

  it('no duplica si ya estaban sembrados', () => {
    const seeded = seedIdeasFromOrdenDia(
      [{ texto: 'Punto A', expositor_nombre: 'A' }],
      [],
      { newRowKey: () => 'a' },
    )
    const again = seedIdeasFromOrdenDia(
      [{ texto: 'Punto A', expositor_nombre: 'A' }],
      seeded,
      { newRowKey: () => 'b' },
    )
    assert.equal(again.length, 1)
    assert.equal(again[0]._claveGrabacion, 'od-1')
  })

  it('abrir cierra automáticamente el anterior', () => {
    let ideas = seedIdeasFromOrdenDia(
      [{ texto: 'Uno' }, { texto: 'Dos' }],
      [],
      { newRowKey: (p) => p + Math.random() },
    )
    ideas = abrirTemaEnIdeas(ideas, 0)
    assert.equal(claveTemaActivo(ideas), 'od-1')
    ideas = abrirTemaEnIdeas(ideas, 1)
    assert.equal(ideas[0]._temaAbierto, false)
    assert.equal(ideas[1]._temaAbierto, true)
    assert.equal(claveTemaActivo(ideas), 'od-2')
    ideas = cerrarTemaEnIdeas(ideas, 1)
    assert.equal(claveTemaActivo(ideas), null)
  })

  it('agregar tema manual al final', () => {
    const base = seedIdeasFromOrdenDia(
      [{ texto: 'OD' }],
      [],
      { newRowKey: () => 'odk' },
    )
    const next = agregarTemaManual(base, {
      titulo: 'Imprevisto',
      quien_dijo: 'Pedro',
      newRowKey: () => 'man1',
    })
    assert.equal(next.length, 2)
    assert.equal(next[1].titulo, 'Imprevisto')
    assert.match(next[1]._claveGrabacion, /^manual-/)
    assert.equal(next[1]._temaAbierto, false)
  })

  it('temasBase excluye sueltas y expone od/manual', () => {
    const ideas = [
      { _claveGrabacion: 'od-1', titulo: 'A', quien_dijo: 'Ana' },
      { _claveGrabacion: 'suelta-1', titulo: 'Libre', quien_dijo: '' },
      { _claveGrabacion: 'manual-x', titulo: 'Extra', quien_dijo: '' },
    ]
    const base = temasBaseDesdeIdeas(ideas)
    assert.equal(base.length, 2)
    assert.equal(base[0].clave, 'od-1')
    assert.equal(base[0].interviniente, 'Ana')
    assert.equal(claveOrdenDia(3), 'od-3')
  })
})
