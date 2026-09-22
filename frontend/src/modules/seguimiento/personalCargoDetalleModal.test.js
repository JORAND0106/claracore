/**
 * Contrato: popup de cargo expone autocompletar del día anterior.
 * Run: node --test src/modules/seguimiento/personalCargoDetalleModal.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PersonalCargoDetalleModal.jsx'), 'utf8')
const panelSrc = readFileSync(join(dir, 'PersonalAsistenciaPanel.jsx'), 'utf8')
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')

describe('PersonalCargoDetalleModal — autocompletar día anterior', () => {
  it('muestra botón por cargo y limpia tramo vía helper', () => {
    assert.match(modalSrc, /bitacora-cargo-autocompletar-dia-anterior/)
    assert.match(modalSrc, /Autocompletar del día anterior/)
    assert.match(modalSrc, /aplicarAutocompletarAsistenciaPorCargo/)
    assert.match(modalSrc, /fetchPlantillaAutocompletar/)
    assert.match(modalSrc, /Tramo queda vacío/)
  })

  it('panel y editor cablean la plantilla del API', () => {
    assert.match(panelSrc, /fetchPlantillaAutocompletar/)
    assert.match(editorSrc, /plantillaAutocompletarDiario/)
    assert.match(editorSrc, /fetchPlantillaAutocompletar=\{/)
  })
})
