/**
 * Escenario C-2D-14 / caso 59: biblioteca independiente + bloques por nodos seleccionados.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metersToWorld } from './esquemaGeometry.js'
import {
  applyLibraryItemToSelectedNodes,
  libraryInsertMode,
  selectedNodesFromSelection,
} from './esquemaLibraryInsert.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
const contrato = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')

function item(id) {
  return {
    id,
    nombre: id,
    objects: [{ type: 'rect', x1: 0, y1: 0, x2: metersToWorld(0.5), y2: metersToWorld(0.5) }],
  }
}

describe('escenario · biblioteca independiente y bloques por nodo (C-2D-14)', () => {
  it('cableado: biblioteca sin amarrar a tipo nodo; inserta en seleccionados o libre', () => {
    assert.match(modal, /applyLibraryItemToSelectedNodes/)
    assert.match(modal, /libraryInsertMode/)
    assert.match(modal, /selectedNodesFromSelection/)
    assert.match(modal, /onToggleNodeNum/)
    assert.match(modal, /esquema-coord-select-/)
    // Ya no cierra la biblioteca al salir de tipo Nodo.
    assert.doesNotMatch(
      modal,
      /Biblioteca \/ mensaje de entidad solo aplican al tipo Nodo/,
    )
    // Panel en huella: no exige tipo nodo.
    assert.doesNotMatch(
      modal,
      /libOpen && huellaTipoRef\.current === 'nodo'/,
    )
    assert.match(modal, /\{libOpen \? \(\s*<BibliotecaPanel/)
    // Free insert snapea con OSNAP y pide el punto de inserción.
    assert.match(modal, /pendingInsertRef\.current[\s\S]{0,400}snapWorldPoint/)
    assert.match(modal, /Toque el punto de inserción/)
    assert.match(contrato, /C-2D-14/)
  })

  it('flujo a–d: libre, nodos 1–2→A, nodo 3→B, cambio nodo 1→B, sin selección = libre', () => {
    const nodes = [1, 2, 3, 4, 5].map((n) => ({
      id: `n${n}`, type: 'nodo', nodeNum: n, x: n * 10, y: 0,
    }))
    assert.equal(libraryInsertMode(nodes, []), 'free')

    let scene = nodes
    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n1', 'n2']),
      item('A'),
    ).objects
    assert.equal(scene.filter((o) => o.type === 'bloque').length, 2)

    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n3']),
      item('B'),
    ).objects
    assert.equal(scene.find((o) => o.onNodeId === 'n3').libraryId, 'B')
    assert.ok(!scene.some((o) => o.type === 'bloque' && (o.onNodeId === 'n4' || o.onNodeId === 'n5')))

    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n1']),
      item('B'),
    ).objects
    assert.equal(scene.find((o) => o.onNodeId === 'n1').libraryId, 'B')
    assert.equal(scene.find((o) => o.onNodeId === 'n2').libraryId, 'A')

    assert.equal(libraryInsertMode(scene, []), 'free')
  })

  it('caso e · SicoeObra dibujo / huella conserva onNodeId en escena (persiste)', () => {
    const insertMod = readFileSync(join(__dirname, 'esquemaLibraryInsert.js'), 'utf8')
    assert.match(insertMod, /onNodeId/)
    assert.match(insertMod, /fromLibraryOnNode: true/)
    assert.match(modal, /applyLibraryItemToSelectedNodes/)
    const sicoe = readFileSync(
      join(__dirname, '../../modules/sicoe-obra/SicoeDibujoReporteEditor.jsx'),
      'utf8',
    )
    assert.match(sicoe, /huellaMode/)
    assert.match(sicoe, /initialCoordRows|esquema_scene|extras\.scene/)
  })
})
