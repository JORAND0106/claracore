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

  it('reclama filas vacías huérfanas y no deja 8 temas para 4 puntos', () => {
    const orden = [
      { texto: 'Presentacion Módulo Actas', expositor_nombre: 'Desarrollo ClaraCore' },
      { texto: 'Videos Capacitación', expositor_nombre: 'Desarrollo ClaraCore' },
      { texto: 'Tercer punto', expositor_nombre: 'Desarrollo ClaraCore' },
      { texto: 'Cuarto punto', expositor_nombre: 'Desarrollo ClaraCore' },
    ]
    // Simula Acta 18: 4 vacías (solo interviniente, sin título/clave) + 4 reales.
    const loaded = [
      { id: 1, titulo: '', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 2, titulo: '', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 3, titulo: '', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 4, titulo: '', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 5, titulo: 'Presentacion Módulo Actas', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 6, titulo: 'Videos Capacitación', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 7, titulo: 'Tercer punto', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
      { id: 8, titulo: 'Cuarto punto', texto: '', quien_dijo: 'Desarrollo ClaraCore' },
    ]
    const next = seedIdeasFromOrdenDia(orden, loaded, { newRowKey: () => 'x' })
    assert.equal(next.length, 4)
    assert.deepEqual(next.map((r) => r._claveGrabacion), ['od-1', 'od-2', 'od-3', 'od-4'])
    assert.equal(next[0].titulo, 'Presentacion Módulo Actas')
    // Conserva ids de las filas con título (no recrea).
    assert.equal(next[0].id, 5)
  })

  it('conserva contenido si se elimina un punto del OD (pasa a manual)', () => {
    const ideas = seedIdeasFromOrdenDia(
      [{ texto: 'A' }, { texto: 'B' }],
      [],
      { newRowKey: (p) => p + '1' },
    )
    ideas[1] = { ...ideas[1], texto: '<p>Contenido importante</p>', id: 99 }
    const after = seedIdeasFromOrdenDia(
      [{ texto: 'A' }],
      ideas,
      { newRowKey: () => 'm' },
    )
    assert.equal(after.length, 2)
    assert.equal(after[0]._claveGrabacion, 'od-1')
    assert.match(after[1]._claveGrabacion, /^manual-/)
    assert.match(after[1].texto, /Contenido importante/)
  })

  it('agregar un punto crea un solo tema nuevo', () => {
    const base = seedIdeasFromOrdenDia(
      [{ texto: 'Uno' }, { texto: 'Dos' }],
      [],
      { newRowKey: () => 'a' },
    )
    const next = seedIdeasFromOrdenDia(
      [{ texto: 'Uno' }, { texto: 'Dos' }, { texto: 'Tres' }],
      base,
      { newRowKey: () => 'b' },
    )
    assert.equal(next.length, 3)
    assert.equal(next[2].titulo, 'Tres')
    assert.equal(next[2]._claveGrabacion, 'od-3')
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
