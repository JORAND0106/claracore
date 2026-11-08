/**
 * C-3D-05 — Extruir opera solo sobre el elemento seleccionado ahora (recorrido A/B/C).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, solidForSourceEntity } from './esquema3dSolids.js'
import {
  initialCotasFromSolid,
  resolveExtrudeSelection,
} from './esquemaExtrudeSelection.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function rect(id, xM = 0, yM = 0) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(xM),
    y1: metersToWorld(yM),
    x2: metersToWorld(xM + 1),
    y2: metersToWorld(yM + 1),
  }
}

describe('resolveExtrudeSelection · recorrido A/B/C', () => {
  const entA = rect('A', 0, 0)
  const entB = rect('B', 2, 0)
  const entC = rect('C', 4, 0)
  const objects = [entA, entB, entC]

  const solidA = extrudeClosedEntity(entA, {
    viewId: 'top', cotaSuperior: 2.4, cotaInferior: 1.77,
  }).solid
  solidA.id = 'solid-A'
  solidA.sourceEntityId = 'A'

  const solidB = extrudeClosedEntity(entB, {
    viewId: 'top', cotaSuperior: 3.0, cotaInferior: 2.0,
  }).solid
  solidB.id = 'solid-B'
  solidB.sourceEntityId = 'B'

  it('a) contorno A sin sólido → create A', () => {
    const r = resolveExtrudeSelection({
      selectedSolidIds: [],
      selectedEntityIds: ['A'],
      solids: [],
      objects,
      viewId: 'top',
    })
    assert.equal(r.ok, true)
    assert.equal(r.kind, 'create')
    assert.equal(r.entity.id, 'A')
  })

  it('b) tras A extruido, seleccionar B (sólido A aún en selectedSolidIds) → create B vacío', () => {
    // Regresión: selectedSolidIds todavía tiene A al seleccionar contorno B.
    const r = resolveExtrudeSelection({
      selectedSolidIds: ['solid-A'],
      selectedEntityIds: ['B'],
      solids: [solidA],
      objects,
      viewId: 'top',
    })
    assert.equal(r.ok, true)
    assert.equal(r.kind, 'create')
    assert.equal(r.entity.id, 'B')
    assert.equal(r.solid, null)
  })

  it('c) seleccionar sólido A → edit con cotas 2,400|0,630|1,770', () => {
    const r = resolveExtrudeSelection({
      selectedSolidIds: ['solid-A'],
      selectedEntityIds: ['A'],
      solids: [solidA, solidB],
      objects,
      viewId: 'top',
    })
    assert.equal(r.ok, true)
    assert.equal(r.kind, 'edit')
    assert.equal(r.solid.id, 'solid-A')
    const cotas = initialCotasFromSolid(r.solid)
    assert.equal(cotas.superior, '2.400')
    assert.equal(cotas.inferior, '1.770')
    assert.equal(cotas.altura, '0.630')
  })

  it('d) seleccionar B → edit B (no A)', () => {
    const r = resolveExtrudeSelection({
      selectedSolidIds: ['solid-B'],
      selectedEntityIds: ['B'],
      solids: [solidA, solidB],
      objects,
      viewId: 'top',
    })
    assert.equal(r.ok, true)
    assert.equal(r.kind, 'edit')
    assert.equal(r.solid.id, 'solid-B')
    const cotas = initialCotasFromSolid(r.solid)
    assert.equal(cotas.superior, '3.000')
    assert.equal(cotas.inferior, '2.000')
  })

  it('e) seleccionar C sin extruir → create C', () => {
    const r = resolveExtrudeSelection({
      selectedSolidIds: ['solid-A'], // basura previa
      selectedEntityIds: ['C'],
      solids: [solidA, solidB],
      objects,
      viewId: 'top',
    })
    assert.equal(r.ok, true)
    assert.equal(r.kind, 'create')
    assert.equal(r.entity.id, 'C')
  })

  it('h) sin selección o con dos → «Seleccione un elemento»', () => {
    assert.equal(resolveExtrudeSelection({
      selectedSolidIds: [], selectedEntityIds: [], solids: [solidA], objects, viewId: 'top',
    }).error, 'Seleccione un elemento')
    assert.equal(resolveExtrudeSelection({
      selectedSolidIds: ['solid-A', 'solid-B'],
      selectedEntityIds: [],
      solids: [solidA, solidB],
      objects,
      viewId: 'top',
    }).error, 'Seleccione un elemento')
    assert.equal(resolveExtrudeSelection({
      selectedSolidIds: [],
      selectedEntityIds: ['A', 'B'],
      solids: [solidA],
      objects,
      viewId: 'top',
    }).error, 'Seleccione un elemento')
  })

  it('solidForSourceEntity distingue A y B', () => {
    const solids = [solidA, solidB]
    assert.equal(solidForSourceEntity(solids, 'A').id, 'solid-A')
    assert.equal(solidForSourceEntity(solids, 'B').id, 'solid-B')
    assert.equal(solidForSourceEntity(solids, 'C'), null)
  })
})

describe('C-3D-05 · wiring modal', () => {
  it('beginExtrude usa resolveExtrudeSelection; popup con key; selectIds limpia sólido', () => {
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /resolveExtrudeSelection/)
    assert.match(modal, /initialCotasFromSolid/)
    assert.match(modal, /promptKey/)
    assert.match(modal, /key=\{extrudePrompt\.promptKey/)
    // Al seleccionar contorno sin sólido ligado, limpia selectedSolidIds
    assert.match(modal, /solidForSourceEntity\(solids3dRef\.current/)
    assert.match(modal, /setSelectedSolidIds\(\[\]\)/)
  })

  it('contrato declara acción sobre el seleccionado ahora', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /elemento seleccionado/)
    assert.match(md, /resolveExtrudeSelection|esquemaExtrudeSelection/)
  })
})
