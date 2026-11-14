import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SICOE_CARPETA_Z,
  SICOE_HERRAMIENTA_POPUP_Z,
  SICOE_HERRAMIENTA_TOAST_Z,
  SICOE_HERRAMIENTA_Z,
  SICOE_POPUP_SOBRE_CARPETA_Z,
  sicoeHerramientasPorDelanteDeCarpeta,
} from './sicoeZIndex.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('sicoeZIndex — herramientas delante de la carpeta', () => {
  it('la escala deja popups y herramientas por encima de la carpeta', () => {
    assert.equal(SICOE_CARPETA_Z, 15000)
    assert.ok(sicoeHerramientasPorDelanteDeCarpeta())
    assert.ok(SICOE_POPUP_SOBRE_CARPETA_Z > SICOE_CARPETA_Z)
    assert.ok(SICOE_HERRAMIENTA_Z > SICOE_CARPETA_Z)
    assert.ok(SICOE_HERRAMIENTA_POPUP_Z > SICOE_HERRAMIENTA_Z)
    assert.ok(SICOE_HERRAMIENTA_TOAST_Z > SICOE_HERRAMIENTA_POPUP_Z)
  })

  it('CarpetaReporte sigue en SICOE_CARPETA_Z', () => {
    const app = read('App.jsx')
    assert.match(app, /zIndex:\s*15000/)
  })

  it('EsquemaEditorModal usa SICOE_HERRAMIENTA_Z', () => {
    const src = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(src, /SICOE_HERRAMIENTA_Z/)
    assert.match(src, /zIndex:\s*SICOE_HERRAMIENTA_Z/)
  })

  it('lista de esquemas y avisos usan capa sobre carpeta', () => {
    const esquemas = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    const mensaje = read('modules/sicoe-obra/SicoeMensajeModal.jsx')
    assert.match(esquemas, /SICOE_POPUP_SOBRE_CARPETA_Z/)
    assert.match(mensaje, /SICOE_POPUP_SOBRE_CARPETA_Z/)
  })

  it('Dibujar / asignar usan capas de herramienta', () => {
    const dibujo = read('modules/sicoe-obra/SicoeDibujoReporteEditor.jsx')
    const asignar = read('modules/sicoe-obra/SicoeEsquemaAsignarPopup.jsx')
    assert.match(dibujo, /SICOE_HERRAMIENTA_POPUP_Z|SICOE_HERRAMIENTA_TOAST_Z/)
    assert.match(asignar, /SICOE_HERRAMIENTA_POPUP_Z/)
  })
})
