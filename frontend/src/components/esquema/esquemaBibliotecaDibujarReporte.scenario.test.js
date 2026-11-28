/**
 * Regresión urgente: biblioteca en «Dibujar reporte» (SicoeObra / huellaMode).
 * Tras C-2D-14 (#1213) el modo libre no insertaba con mapa+paneo por defecto,
 * y el hint quedaba oculto si el tipo no era «nodo».
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
import { instantiateLibraryItem } from './esquemaLibrary.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
const contrato = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
const sicoe = readFileSync(
  join(__dirname, '../../modules/sicoe-obra/SicoeDibujoReporteEditor.jsx'),
  'utf8',
)

function item(id) {
  return {
    id,
    nombre: id,
    objects: [{ type: 'rect', x1: 0, y1: 0, x2: metersToWorld(0.5), y2: metersToWorld(0.5) }],
  }
}

describe('escenario · biblioteca en Dibujar reporte (huella + nodos + libre)', () => {
  it('SicoeObra Dibujar usa huellaMode + autoActivateMap (paneo por defecto)', () => {
    assert.match(sicoe, /huellaMode/)
    assert.match(sicoe, /autoActivateMap/)
    assert.match(modal, /setTool\('paneo'\)/)
  })

  it('modo libre: hint exacto y sale de paneo para recibir el toque', () => {
    assert.match(modal, /Toque el punto de inserción/)
    // beginInsertLibraryItem en modo libre fuerza selección + hint.
    assert.match(
      modal,
      /pendingInsertRef\.current = \{ item, onPlane, free: true \}[\s\S]{0,280}setInsertHint\('Toque el punto de inserción'\)[\s\S]{0,120}setTool\('seleccion'\)/,
    )
    // pendingInsert se consume ANTES del early-return de mapa+paneo.
    const pendingIdx = modal.indexOf('Inserción libre de biblioteca: tiene prioridad sobre paneo/mapa')
    const paneoIdx = modal.indexOf('Con mapa activo + Paneo: el mapa recibe el arrastre')
    assert.ok(pendingIdx > 0, 'falta bloque de prioridad pendingInsert')
    assert.ok(paneoIdx > pendingIdx, 'pendingInsert debe ir antes del return de paneo')
    // Canvas recibe eventos con insertHint aunque tool siga en paneo un frame.
    assert.match(modal, /!insertHint\) \? 'none' : 'auto'/)
    // Hint visible en barra CMD de huella (no gated por tipo nodo).
    assert.doesNotMatch(
      modal,
      /const insertHintVisible = dibujoTipoRef\.current === 'nodo'/,
    )
    assert.match(modal, /cotaKindHint \|\| insertHint \|\| ''/)
    assert.match(modal, /data-testid="esquema-command-bar"/)
  })

  it('flujo a–c Dibujar reporte: nodos 1–2→A, nodo 3→B, libre sin selección', () => {
    const nodes = [1, 2, 3, 4, 5].map((n) => ({
      id: `n${n}`, type: 'nodo', nodeNum: n, x: n * 10, y: 0, este: 100 + n, norte: 200 + n,
    }))
    let scene = nodes
    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n1', 'n2']),
      item('A'),
      { onPlane: true },
    ).objects
    assert.equal(scene.filter((o) => o.type === 'bloque' && o.fromLibraryOnNode).length, 2)
    assert.ok(scene.every((o) => o.type !== 'bloque' || o.onNodeId === 'n1' || o.onNodeId === 'n2'))

    scene = applyLibraryItemToSelectedNodes(
      scene,
      selectedNodesFromSelection(scene, ['n3']),
      item('B'),
      { onPlane: true },
    ).objects
    assert.equal(scene.find((o) => o.onNodeId === 'n3').libraryId, 'B')
    assert.equal(scene.find((o) => o.onNodeId === 'n1').libraryId, 'A')
    assert.equal(libraryInsertMode(scene, []), 'free')

    // Inserción libre (simula toque): bloque suelto a 1:1, sin onNodeId.
    const free = instantiateLibraryItem(item('C'), { x: 50, y: 60 })
    assert.equal(free.length, 1)
    assert.equal(free[0].type, 'bloque')
    assert.ok(!free[0].onNodeId)
  })

  it('tabla puede materializar nodos faltantes al seleccionar N° (Dibujar reporte)', () => {
    assert.match(modal, /materializa solo los N° pedidos desde la tabla/)
    assert.match(modal, /topoToWorld\(este, norte, origin\)/)
  })

  it('contrato C-2D-14 / caso 60 documenta Dibujar reporte', () => {
    assert.match(contrato, /C-2D-14/)
    assert.match(contrato, /Toque el punto de inserción/)
    assert.match(contrato, /Dibujar reporte/)
  })
})
