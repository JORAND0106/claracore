import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  avanceTrasGuardar,
  compromisosQueBloqueanAvance,
  emptyFlujoTabs,
  flujoInicialNuevaActa,
  flujoLiberado,
  mergeFlujoProgress,
  normalizeOrdenItem,
  parseFlujoTabs,
  puedeAvanzarDesdeCompromisos,
  serializeOrdenItems,
  tabDesbloqueada,
} from './actaFlujoTabs.js'

describe('actaFlujoTabs', () => {
  it('parseFlujoTabs: nueva vs legacy liberado', () => {
    assert.deepEqual(flujoInicialNuevaActa(), {
      orden: false,
      asistentes: false,
      compromisos: false,
      ideas: false,
      liberado: false,
      v: 1,
    })
    assert.equal(parseFlujoTabs({}).liberado, true)
    assert.equal(parseFlujoTabs('{}').liberado, true)
    assert.equal(parseFlujoTabs({ liberado: true }).liberado, true)
    assert.equal(parseFlujoTabs({ v: 1, orden: true }).liberado, false)
    assert.equal(parseFlujoTabs({ v: 1, orden: true, ideas: true }).liberado, true)
    assert.equal(flujoLiberado({}), true)
    assert.equal(flujoLiberado({ v: 1 }), false)
  })

  it('mergeFlujoProgress no regresa hitos si el server viene vacío', () => {
    const local = avanceTrasGuardar('orden', flujoInicialNuevaActa()).flujo
    assert.equal(local.orden, true)
    const mergedOk = mergeFlujoProgress(local, {})
    assert.equal(mergedOk.orden, true)
    assert.equal(mergedOk.liberado, false)
    assert.equal(mergedOk.v, 1)
    const mergedVer = mergeFlujoProgress(local, { v: 1 })
    assert.equal(mergedVer.orden, true)
    assert.equal(mergedVer.liberado, false)
  })

  it('tabDesbloqueada respeta secuencia en primer diligenciamiento', () => {
    assert.equal(tabDesbloqueada('orden', { encabezadoGuardado: false, flujo: flujoInicialNuevaActa() }), false)
    assert.equal(tabDesbloqueada('encabezado', { encabezadoGuardado: false, flujo: {} }), true)
    assert.equal(tabDesbloqueada('orden', { encabezadoGuardado: true, flujo: flujoInicialNuevaActa() }), true)
    assert.equal(tabDesbloqueada('asistentes', { encabezadoGuardado: true, flujo: flujoInicialNuevaActa() }), false)
    assert.equal(tabDesbloqueada('asistentes', { encabezadoGuardado: true, flujo: { v: 1, orden: true } }), true)
    assert.equal(tabDesbloqueada('compromisos', { encabezadoGuardado: true, flujo: { v: 1, orden: true } }), false)
    assert.equal(
      tabDesbloqueada('compromisos', { encabezadoGuardado: true, flujo: { v: 1, orden: true, asistentes: true } }),
      true,
    )
    assert.equal(
      tabDesbloqueada('apartados', {
        encabezadoGuardado: true,
        flujo: { v: 1, orden: true, asistentes: true, compromisos: true },
      }),
      false,
    )
  })

  it('liberado / legacy desbloquea todas las pestañas', () => {
    for (const flujo of [{ liberado: true }, {}]) {
      const ctx = { encabezadoGuardado: true, flujo }
      for (const id of ['encabezado', 'orden', 'asistentes', 'compromisos', 'ideas', 'apartados', 'acciones']) {
        assert.equal(tabDesbloqueada(id, ctx), true, `${JSON.stringify(flujo)} ${id}`)
      }
    }
  })

  it('bloquea avance desde compromisos si hay abiertos (solo si no liberado)', () => {
    const items = [
      { id: 1, estado_gestion: 'cumplido' },
      { id: 2, estado_gestion: 'abierto' },
      { id: 3, estado_gestion: 'en_progreso' },
    ]
    assert.equal(compromisosQueBloqueanAvance(items).length, 1)
    assert.equal(puedeAvanzarDesdeCompromisos(items), false)

    const blocked = avanceTrasGuardar('compromisos', { v: 1, orden: true, asistentes: true }, {
      compromisPrevios: items,
    })
    assert.equal(blocked.ok, false)
    assert.match(blocked.error, /Abierto/)

    const ok = avanceTrasGuardar('compromisos', { v: 1, orden: true, asistentes: true }, {
      compromisPrevios: [{ estado_gestion: 'en_progreso' }],
    })
    assert.equal(ok.ok, true)
    assert.equal(ok.flujo.compromisos, true)
    assert.equal(ok.nextTab, 'ideas')

    const libre = avanceTrasGuardar('compromisos', { liberado: true }, { compromisPrevios: items })
    assert.equal(libre.ok, true)
  })

  it('guardar Orden avanza a Asistentes; Temas libera a Vista previa', () => {
    const a = avanceTrasGuardar('orden', flujoInicialNuevaActa())
    assert.equal(a.flujo.orden, true)
    assert.equal(a.flujo.v, 1)
    assert.equal(a.nextTab, 'asistentes')
    assert.equal(
      tabDesbloqueada('asistentes', { encabezadoGuardado: true, flujo: a.flujo }),
      true,
    )

    const b = avanceTrasGuardar('asistentes', a.flujo)
    assert.equal(b.nextTab, 'compromisos')

    const c = avanceTrasGuardar('ideas', { ...b.flujo, compromisos: true })
    assert.equal(c.flujo.ideas, true)
    assert.equal(c.flujo.liberado, true)
    assert.equal(c.nextTab, 'acciones')
  })

  it('serialize/normalize orden con expositor', () => {
    const n = normalizeOrdenItem({
      texto: 'Punto A',
      hecho: true,
      expositor_nombre: 'Ana Pérez',
      expositor_usuario_id: 42,
    }, () => 'k1')
    assert.equal(n.expositor_nombre, 'Ana Pérez')
    assert.equal(n.expositor_usuario_id, 42)

    const ser = serializeOrdenItems([
      { texto: '  Punto A ', hecho: false, expositor_nombre: 'Ana', expositor_usuario_id: 42 },
      { texto: '   ', hecho: false },
      { texto: 'Sin expositor', hecho: true },
    ])
    assert.deepEqual(ser, [
      { texto: 'Punto A', hecho: false, expositor_nombre: 'Ana', expositor_usuario_id: 42 },
      { texto: 'Sin expositor', hecho: true },
    ])
  })

  it('emptyFlujoTabs null inicia secuencia; {} es legacy', () => {
    assert.equal(emptyFlujoTabs(null).v, 1)
    assert.equal(emptyFlujoTabs(null).liberado, false)
    assert.equal(emptyFlujoTabs({}).liberado, true)
  })
})
