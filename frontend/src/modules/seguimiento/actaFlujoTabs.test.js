import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  avanceTrasGuardar,
  compromisosQueBloqueanAvance,
  emptyFlujoTabs,
  flujoLiberado,
  normalizeOrdenItem,
  parseFlujoTabs,
  puedeAvanzarDesdeCompromisos,
  serializeOrdenItems,
  tabDesbloqueada,
} from './actaFlujoTabs.js'

describe('actaFlujoTabs', () => {
  it('parseFlujoTabs normaliza flags e incluye liberado', () => {
    assert.deepEqual(parseFlujoTabs(null), emptyFlujoTabs())
    assert.deepEqual(parseFlujoTabs({ orden: 1, ideas: true }), {
      orden: true,
      asistentes: false,
      compromisos: false,
      ideas: true,
      liberado: true, // ideas implica liberado
    })
    assert.equal(flujoLiberado({ liberado: true }), true)
    assert.equal(flujoLiberado({}), false)
  })

  it('tabDesbloqueada respeta secuencia en primer diligenciamiento', () => {
    assert.equal(tabDesbloqueada('orden', { encabezadoGuardado: false, flujo: {} }), false)
    assert.equal(tabDesbloqueada('encabezado', { encabezadoGuardado: false, flujo: {} }), true)
    assert.equal(tabDesbloqueada('orden', { encabezadoGuardado: true, flujo: {} }), true)
    assert.equal(tabDesbloqueada('asistentes', { encabezadoGuardado: true, flujo: {} }), false)
    assert.equal(tabDesbloqueada('asistentes', { encabezadoGuardado: true, flujo: { orden: true } }), true)
    assert.equal(tabDesbloqueada('compromisos', { encabezadoGuardado: true, flujo: { orden: true } }), false)
    assert.equal(
      tabDesbloqueada('compromisos', { encabezadoGuardado: true, flujo: { orden: true, asistentes: true } }),
      true,
    )
    assert.equal(
      tabDesbloqueada('ideas', {
        encabezadoGuardado: true,
        flujo: { orden: true, asistentes: true, compromisos: true },
      }),
      true,
    )
    assert.equal(
      tabDesbloqueada('apartados', {
        encabezadoGuardado: true,
        flujo: { orden: true, asistentes: true, compromisos: true },
      }),
      false,
    )
    assert.equal(
      tabDesbloqueada('acciones', {
        encabezadoGuardado: true,
        flujo: { orden: true, asistentes: true, compromisos: true, ideas: true },
      }),
      true,
    )
  })

  it('liberado desbloquea todas las pestañas', () => {
    const ctx = { encabezadoGuardado: true, flujo: { liberado: true } }
    for (const id of ['encabezado', 'orden', 'asistentes', 'compromisos', 'ideas', 'apartados', 'acciones']) {
      assert.equal(tabDesbloqueada(id, ctx), true, id)
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
    assert.equal(puedeAvanzarDesdeCompromisos([{ estado_gestion: 'cumplido' }]), true)
    assert.equal(puedeAvanzarDesdeCompromisos([]), true)

    const blocked = avanceTrasGuardar('compromisos', { orden: true, asistentes: true }, {
      compromisPrevios: items,
    })
    assert.equal(blocked.ok, false)
    assert.match(blocked.error, /Abierto/)

    const ok = avanceTrasGuardar('compromisos', { orden: true, asistentes: true }, {
      compromisPrevios: [{ estado_gestion: 'en_progreso' }],
    })
    assert.equal(ok.ok, true)
    assert.equal(ok.flujo.compromisos, true)
    assert.equal(ok.nextTab, 'ideas')

    const libre = avanceTrasGuardar('compromisos', { liberado: true }, { compromisPrevios: items })
    assert.equal(libre.ok, true)
    assert.equal(libre.flujo.liberado, true)
  })

  it('guardar Temas libera el documento e ir a Vista previa', () => {
    const a = avanceTrasGuardar('orden', {})
    assert.equal(a.flujo.orden, true)
    assert.equal(a.nextTab, 'asistentes')

    const b = avanceTrasGuardar('asistentes', a.flujo)
    assert.equal(b.flujo.asistentes, true)
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
})
