/**
 * ClaraGIS embed: Dibujar/Esquema deben portarse a document.body
 * (evita clip por .cc-claragis-root transform/overflow).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Dibujar desde ClaraGIS = misma herramienta portaleada', () => {
  it('SicoeDibujoReporteEditor usa createPortal a body', () => {
    const src = read('modules/sicoe-obra/SicoeDibujoReporteEditor.jsx')
    assert.match(src, /createPortal/)
    assert.match(src, /huellaMode/)
    assert.match(src, /document\.body/)
  })

  it('SicoeEsquemasReporteModal no redeclara ui (rompe vite build)', () => {
    const src = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(src, /createPortal\(modal, document\.body\)/)
    // Un solo `const ui` de tema; el JSX del portal se llama `modal`.
    const decls = src.match(/\bconst ui\b/g) || []
    assert.equal(decls.length, 1)
    assert.match(src, /\bconst modal = \(/)
  })

  it('EsquemaEditorModal se porta a body (fuera del embed)', () => {
    const src = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(src, /createPortal\(overlay, document\.body\)/)
    assert.match(src, /data-testid="esquema-editor-overlay"/)
  })

  it('móvil muestra selector Nodo|Línea|Polígono también en huellaMode', () => {
    const src = read('components/esquema/EsquemaEditorModal.jsx')
    // El bloque phone ya no condiciona !huellaMode para ocultar el tipo.
    const phoneIdx = src.indexOf('data-testid="esquema-phone-panels"')
    assert.ok(phoneIdx > 0)
    const phoneSlice = src.slice(phoneIdx, phoneIdx + 2500)
    assert.match(phoneSlice, /DibujoTipoCompactPanel/)
    assert.equal(/!huellaMode \?[\s\S]*DibujoTipoCompactPanel/.test(phoneSlice), false)
  })

  it('embed tiene iconos separados Dibujar y Esquemas', () => {
    const app = read('App.jsx')
    assert.match(app, /data-testid="sicoe-dibujo-reporte-btn"/)
    assert.match(app, /data-testid="sicoe-esquemas-reporte-btn"/)
    assert.match(app, /setEditorDibujoReporte\(true\)/)
    assert.match(app, /setEsquemasReporteOpen\(true\)/)
  })
})
