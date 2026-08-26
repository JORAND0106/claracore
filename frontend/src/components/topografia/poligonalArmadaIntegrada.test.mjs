/**
 * Regresión: popup de armada integrado con puntos de cartera.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function read(name) {
  return readFileSync(join(dir, name), 'utf8')
}

describe('PoligonalArmadaEditModal integrado', () => {
  it('lista puntos capturados y permite editar/agregar/eliminar', () => {
    const src = read('PoligonalArmadaEditModal.jsx')
    assert.match(src, /Puntos capturados en esta armada/)
    assert.match(src, /onSavePunto/)
    assert.match(src, /onAddPunto/)
    assert.match(src, /onDeletePunto/)
    assert.match(src, /Agregar punto/)
    assert.match(src, /Ang\. obs\./)
    assert.match(src, /Azimut/)
  })

  it('PoligonalModal cablea handlers y mantiene el popup abierto tras sync', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /guardarPuntoDesdeArmada/)
    assert.match(src, /agregarPuntoDesdeArmada/)
    assert.match(src, /armada_id: editArmadaModal\.id/)
    assert.match(src, /onSavePunto=\{guardarPuntoDesdeArmada\}/)
    assert.match(src, /onAddPunto=\{agregarPuntoDesdeArmada\}/)
    assert.match(src, /onDeletePunto=\{solicitarEliminarPunto\}/)
    // guardarArmadaPopup no cierra el modal tras guardar la cabecera
    const fn = src.match(/const guardarArmadaPopup = async \(payload\) => \{[\s\S]*?\n  \}/)?.[0] || ''
    assert.ok(fn.includes('sincronizarDetalle'), 'guardarArmadaPopup debe sincronizar detalle')
    assert.ok(!fn.includes('setEditArmadaModal(null)'), 'guardarArmadaPopup no debe cerrar el popup')
  })

  it('conserva atajo de edición desde Cartera', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /PoligonalPuntoEditModal/)
    assert.match(src, /setEditPuntoModal/)
  })
})
