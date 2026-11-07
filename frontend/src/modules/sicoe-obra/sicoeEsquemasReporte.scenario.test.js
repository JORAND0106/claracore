/**
 * Contrato C-OUT-18: esquemas a nivel de reporte + galería ordenada.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('sicoeEsquemasReporte · contrato UI', () => {
  it('botón Esquemas junto a Editar dibujo en CarpetaReporte', () => {
    const app = read('App.jsx')
    assert.match(app, /sicoe-esquemas-reporte-btn/)
    assert.match(app, /SicoeEsquemasReporteModal/)
    assert.match(app, /Editar dibujo/)
    assert.match(app, /Esquemas/)
  })

  it('registro ya no ofrece botón Crear esquema', () => {
    const app = read('App.jsx')
    // Los botones ✎ Crear/Editar esquema del registro se retiraron.
    assert.match(app, /Crear\/editar esquema: desde el botón «Esquemas»/)
    assert.doesNotMatch(app, /title=\{grafVista \? 'Editar esquema' : 'Crear esquema'\}/)
    assert.doesNotMatch(app, /title="Crear esquema"/)
  })

  it('modal de lista + asignación + editor', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /Nuevo esquema/)
    assert.match(modal, /Cambiar asignación/)
    assert.match(modal, /SicoeEsquemaAsignarPopup/)
    assert.match(modal, /EsquemaEditorModal/)
    assert.match(modal, /presentEsquemaExportPopup/)
    assert.match(modal, /planificarActualizacionVersionEsquema/)
  })

  it('galería busca por número y ordena', () => {
    const app = read('App.jsx')
    assert.match(app, /sicoe-galeria-grafico-buscar/)
    assert.match(app, /Buscar por nº gráfico o reporte/)
  })

  it('contrato documenta C-OUT-18', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-OUT-18/)
    assert.match(md, /Esquemas del reporte/)
    assert.match(md, /sicoeEsquemasReporte/)
  })
})
