import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  agregarTemaManual,
  abrirTemaEnIdeas,
  cerrarTemaEnIdeas,
  claveOrdenDia,
  claveTemaActivo,
  reunirTextosIdeasConTemas,
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

  it('reúne texto huérfano tN con el tema OD del mismo título', () => {
    const ideas = [
      { id: 1, _claveGrabacion: 'od-1', titulo: 'Presentacion', texto: '', quien_dijo: 'A' },
      { id: 2, _claveGrabacion: 'od-2', titulo: 'Videos', texto: '', quien_dijo: 'A' },
      { id: 3, _claveGrabacion: 't2', titulo: 'Videos', texto: '<p>Resumen de videos</p>', quien_dijo: '' },
      { id: 4, _claveGrabacion: 'suelta-1', titulo: '', texto: '<p>Idea libre</p>', quien_dijo: '' },
    ]
    const { ideas: next, reporte } = reunirTextosIdeasConTemas(ideas, { withReport: true })
    assert.equal(next.length, 3)
    assert.equal(next[1]._claveGrabacion, 'od-2')
    assert.match(next[1].texto, /Resumen de videos/)
    assert.equal(next[2]._claveGrabacion, 'suelta-1')
    assert.equal(next[2].titulo, 'Idea general')
    assert.equal(reporte.unidos.length, 1)
    // t2 se remapea a od-2 y se colapsa por misma clave (vínculo real de tema N).
    assert.ok(['misma_clave', 'titulo_identico', 'titulo_normalizado'].includes(reporte.unidos[0].motivo))
  })

  it('seed al reabrir une texto separado al tema OD (caso Acta 18)', () => {
    const orden = [
      { texto: 'Presentacion Módulo Actas', expositor_nombre: 'Dev' },
      { texto: 'Videos Capacitación', expositor_nombre: 'Dev' },
      { texto: 'Tercer punto', expositor_nombre: 'Dev' },
      { texto: 'Cuarto punto', expositor_nombre: 'Dev' },
    ]
    const loaded = [
      { id: 1, titulo: 'Presentacion Módulo Actas', texto: '', quien_dijo: 'Dev', clave_grabacion: 'od-1', _claveGrabacion: 'od-1' },
      { id: 2, titulo: 'Videos Capacitación', texto: '', quien_dijo: 'Dev', clave_grabacion: 'od-2', _claveGrabacion: 'od-2' },
      { id: 3, titulo: 'Tercer punto', texto: '', quien_dijo: 'Dev', clave_grabacion: 'od-3', _claveGrabacion: 'od-3' },
      { id: 4, titulo: 'Cuarto punto', texto: '', quien_dijo: 'Dev', clave_grabacion: 'od-4', _claveGrabacion: 'od-4' },
      { id: 5, titulo: 'Videos Capacitación', texto: '<p>Texto videos</p>', quien_dijo: '', _claveGrabacion: 't2' },
      { id: 6, titulo: 'Tercer punto', texto: '<p>Texto tres</p>', quien_dijo: '', _claveGrabacion: 't3' },
      { id: 7, titulo: 'Cuarto punto', texto: '<p>Texto cuatro</p>', quien_dijo: '', _claveGrabacion: 't4' },
    ]
    const next = seedIdeasFromOrdenDia(orden, loaded, { newRowKey: () => 'x' })
    assert.equal(next.length, 4)
    assert.match(next[1].texto, /Texto videos/)
    assert.match(next[2].texto, /Texto tres/)
    assert.match(next[3].texto, /Texto cuatro/)
    assert.equal(next[0].texto || '', '')
  })

  it('une por número de tema (orden) aunque el título IA no coincida — Acta 18 real', () => {
    // Filas 1-4: OD solo título. Filas texto con orden 1,2,3 (= números 2,3,4 en pantalla).
    const ideas = [
      { id: 1, orden: 0, _claveGrabacion: 'od-1', _desdeOrdenDia: true, titulo: 'Presentacion Módulo Actas', texto: '', quien_dijo: 'Dev' },
      { id: 2, orden: 1, _claveGrabacion: 'od-2', _desdeOrdenDia: true, titulo: 'Videos Capacitación', texto: '', quien_dijo: 'Dev' },
      { id: 3, orden: 2, _claveGrabacion: 'od-3', _desdeOrdenDia: true, titulo: 'Módulo de Almacén', texto: '', quien_dijo: 'Dev' },
      { id: 4, orden: 3, _claveGrabacion: 'od-4', _desdeOrdenDia: true, titulo: 'Acta de recibo parcial', texto: '', quien_dijo: 'Dev' },
      { id: 5, orden: 1, titulo: 'Resumen de la sesión de videos', texto: '<p>Se revisaron los videos de capacitación del módulo.</p>', quien_dijo: '' },
      { id: 6, orden: 2, titulo: 'Notas del almacén', texto: '<p>Avances del módulo de almacén y pendientes.</p>', quien_dijo: '' },
      { id: 7, orden: 3, titulo: 'Recibo parcial de obra', texto: '<p>Acuerdos del acta de recibo parcial.</p>', quien_dijo: '' },
    ]
    const { ideas: next, reporte } = reunirTextosIdeasConTemas(ideas, { withReport: true })
    assert.equal(next.length, 4, `esperaba 4 filas, got ${next.length}`)
    assert.equal(reporte.unidos.length, 3)
    assert.match(next[1].texto, /videos de capacitación/i)
    assert.match(next[2].texto, /módulo de almacén/i)
    assert.match(next[3].texto, /recibo parcial/i)
    assert.ok(!plainOrEmpty(next[0].texto))
  })

  it('recorrido guardar→reabrir: payload reunido no vuelve a separar', () => {
    const orden = [
      { texto: 'Presentacion Módulo Actas' },
      { texto: 'Videos Capacitación' },
      { texto: 'Módulo de Almacén' },
      { texto: 'Acta de recibo parcial' },
    ]
    const duringRecording = [
      { id: 1, orden: 0, _claveGrabacion: 'od-1', titulo: 'Presentacion Módulo Actas', texto: '', quien_dijo: 'Dev' },
      { id: 2, orden: 1, _claveGrabacion: 'od-2', titulo: 'Videos Capacitación', texto: '', quien_dijo: 'Dev' },
      { id: 3, orden: 2, _claveGrabacion: 'od-3', titulo: 'Módulo de Almacén', texto: '', quien_dijo: 'Dev' },
      { id: 4, orden: 3, _claveGrabacion: 'od-4', titulo: 'Acta de recibo parcial', texto: '', quien_dijo: 'Dev' },
      // Simula el estado roto justo antes de guardar (texto en filas aparte con nº 2,3,4).
      { orden: 1, titulo: 'Capacitación en video', texto: '<p>Contenido videos capacitación</p>', quien_dijo: '' },
      { orden: 2, titulo: 'Almacén Clara', texto: '<p>Contenido módulo almacén</p>', quien_dijo: '' },
      { orden: 3, titulo: 'Recibo', texto: '<p>Contenido acta recibo parcial</p>', quien_dijo: '' },
    ]
    const alGuardar = reunirTextosIdeasConTemas(duringRecording)
    assert.equal(alGuardar.length, 4)
    // Persistido (como buildPayload): orden 0..3 con texto dentro.
    const persisted = alGuardar.map((row, idx) => ({
      id: row.id || 100 + idx,
      orden: idx,
      titulo: row.titulo,
      texto: row.texto,
      quien_dijo: row.quien_dijo,
      clave_grabacion: row._claveGrabacion,
      _claveGrabacion: row._claveGrabacion,
    }))
    const reabierto = seedIdeasFromOrdenDia(orden, persisted, { newRowKey: () => 'r' })
    assert.equal(reabierto.length, 4)
    assert.match(reabierto[1].texto, /videos capacitación/i)
    assert.match(reabierto[2].texto, /módulo almacén/i)
    assert.match(reabierto[3].texto, /recibo parcial/i)
  })
})

function plainOrEmpty(html) {
  const s = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return s.length > 0
}
