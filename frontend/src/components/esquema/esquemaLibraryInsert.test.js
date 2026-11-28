/**
 * C-2D-14 · Biblioteca independiente y bloques solo en nodos seleccionados.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  applyLibraryItemToSelectedNodes,
  isBloqueOnNode,
  libraryInsertMode,
  selectedNodesFromSelection,
} from './esquemaLibraryInsert.js'

function libItem(id, nombre = id) {
  return {
    id,
    nombre,
    objects: [{
      type: 'rect',
      x1: 0,
      y1: 0,
      x2: metersToWorld(0.4),
      y2: metersToWorld(0.4),
    }],
  }
}

function fiveNodes() {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `n${n}`,
    type: 'nodo',
    nodeNum: n,
    x: metersToWorld(n),
    y: 0,
    este: 1000 + n,
    norte: 2000 + n,
  }))
}

describe('esquemaLibraryInsert', () => {
  it('sin nodos seleccionados → modo libre (nunca todos los nodos)', () => {
    const nodes = fiveNodes()
    assert.equal(libraryInsertMode(nodes, []), 'free')
    assert.equal(libraryInsertMode(nodes, new Set(['x'])), 'free')
    assert.deepEqual(selectedNodesFromSelection(nodes, ['n1', 'n2']).map((n) => n.id), ['n1', 'n2'])
  })

  it('inserta solo en nodos 1 y 2; 3–5 sin bloque', () => {
    const nodes = fiveNodes()
    const itemA = libItem('A')
    const { objects, placed, mode } = applyLibraryItemToSelectedNodes(
      nodes,
      selectedNodesFromSelection(nodes, ['n1', 'n2']),
      itemA,
      { onPlane: true },
    )
    assert.equal(mode, 'nodes')
    assert.equal(placed.length, 2)
    const bloques = objects.filter((o) => o.type === 'bloque')
    assert.equal(bloques.length, 2)
    assert.ok(bloques.every((b) => b.libraryId === 'A' && b.fromLibraryOnNode && b.onNodeId))
    assert.ok(bloques.some((b) => b.onNodeId === 'n1'))
    assert.ok(bloques.some((b) => b.onNodeId === 'n2'))
    assert.ok(!bloques.some((b) => b.onNodeId === 'n3'))
    // nodos intactos
    assert.equal(objects.filter((o) => o.type === 'nodo').length, 5)
  })

  it('nodo 3 recibe B sin tocar A en 1 y 2', () => {
    const nodes = fiveNodes()
    let scene = nodes
    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n1', 'n2']),
      libItem('A'),
    ).objects
    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n3']),
      libItem('B'),
    ).objects
    const bloques = scene.filter((o) => o.type === 'bloque')
    assert.equal(bloques.length, 3)
    assert.equal(bloques.find((b) => b.onNodeId === 'n1').libraryId, 'A')
    assert.equal(bloques.find((b) => b.onNodeId === 'n2').libraryId, 'A')
    assert.equal(bloques.find((b) => b.onNodeId === 'n3').libraryId, 'B')
    assert.ok(!bloques.some((b) => b.onNodeId === 'n4' || b.onNodeId === 'n5'))
  })

  it('cambiar bloque del nodo 1 a B conserva A en nodo 2', () => {
    const nodes = fiveNodes()
    let scene = applyLibraryItemToSelectedNodes(
      nodes,
      selectedNodesFromSelection(nodes, ['n1', 'n2']),
      libItem('A'),
    ).objects
    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n1']),
      libItem('B'),
    ).objects
    const b1 = scene.find((o) => o.type === 'bloque' && o.onNodeId === 'n1')
    const b2 = scene.find((o) => o.type === 'bloque' && o.onNodeId === 'n2')
    assert.equal(b1.libraryId, 'B')
    assert.equal(b2.libraryId, 'A')
    assert.equal(scene.filter((o) => o.type === 'bloque').length, 2)
  })

  it('isBloqueOnNode reconoce onNodeId y legado por centro', () => {
    const n = { id: 'n9', type: 'nodo', nodeNum: 9, x: 100, y: 50 }
    const modern = {
      type: 'bloque', x: 80, y: 30, w: 40, h: 40,
      fromLibraryOnNode: true, onNodeId: 'n9',
    }
    const legacy = {
      type: 'bloque', x: 80, y: 30, w: 40, h: 40,
      fromLibraryOnNode: true,
    }
    assert.equal(isBloqueOnNode(modern, n), true)
    assert.equal(isBloqueOnNode(legacy, n), true)
    assert.equal(isBloqueOnNode({ type: 'bloque', x: 0, y: 0, w: 10, h: 10 }, n), false)
  })

  it('punto de inserción = coordenada exacta del nodo', () => {
    const n = { id: 'n1', type: 'nodo', nodeNum: 1, x: 123.4, y: 56.7 }
    const { placed } = applyLibraryItemToSelectedNodes([n], [n], libItem('A'), { onPlane: true })
    const b = placed[0]
    const cx = (b.x || 0) + (b.w || 0) / 2
    const cy = (b.y || 0) + (b.h || 0) / 2
    assert.ok(Math.abs(cx - 123.4) < 1e-6)
    assert.ok(Math.abs(cy - 56.7) < 1e-6)
  })
})
