/**
 * Regresión: edición popup + papelera en módulo poligonal.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

function read(name) {
  return readFileSync(join(root, name), 'utf8')
}

describe('poligonal edición popup y papelera', () => {
  it('PoligonalModal importa popups, undo y papelera', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /PoligonalArmadaEditModal/)
    assert.match(src, /PoligonalPuntoEditModal/)
    assert.match(src, /PoligonalUndoToast/)
    assert.match(src, /PoligonalPapeleraPanel/)
    assert.match(src, /TopoConfirmModal/)
    assert.match(src, /solicitarEliminarPunto/)
    assert.match(src, /deshacerEliminacion/)
    assert.match(src, /\/papelera/)
    assert.match(src, /\/restaurar/)
  })

  it('fila de armada abre modal de edición', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /setEditArmadaModal\(arm\)/)
    assert.match(src, /Clic para editar armada/)
  })

  it('cartera abre popup (no solo inline) y confirma eliminación', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /setEditPuntoModal\(p\)/)
    assert.match(src, /guardarEdicionPopup/)
    assert.doesNotMatch(src, /onClick=\{guardarEdicion\}/)
    assert.match(src, /confirmEliminar/)
  })

  it('componentes de UI existen', () => {
    assert.ok(read('PoligonalArmadaEditModal.jsx').includes('Editar armada'))
    assert.ok(read('PoligonalPuntoEditModal.jsx').includes('Editar punto'))
    assert.ok(read('PoligonalUndoToast.jsx').includes('Deshacer'))
    assert.ok(read('PoligonalPapeleraPanel.jsx').includes('Papelera'))
  })

  it('offline soft-delete y restaurar estaciones/armadas', () => {
    const src = read('offline/topoOfflineRouter.js')
    assert.match(src, /dado_de_baja:\s*true/)
    assert.match(src, /parts\[4\] === 'restaurar'/)
    assert.match(src, /papelera/)
    assert.match(src, /filter\(\(e\) => !e\.dado_de_baja\)/)
  })
})
