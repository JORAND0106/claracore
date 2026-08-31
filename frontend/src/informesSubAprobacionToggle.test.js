/**
 * Regresión: toggle Todo | Aprobado en Informes Subcontratista.
 * node --test frontend/src/informesSubAprobacionToggle.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const ui = readFileSync(join(dir, 'ModuloInformes.jsx'), 'utf8')

describe('Informes Subcontratista — toggle Todo|Aprobado', () => {
  it('UI: estado default aprobado + control Todo|Aprobado', () => {
    assert.match(ui, /useState\('aprobado'\)/)
    assert.match(ui, /Registros del corte/)
    assert.match(ui, /onFiltroSubAprobacionChange/)
    assert.match(ui, /label: 'Todo'/)
    assert.match(ui, /label: 'Aprobado'/)
  })

  it('UI: items-corte y PDF/Excel pasan solo_aprobados', () => {
    assert.match(ui, /pathConFiltroSubAprobacion/)
    assert.match(ui, /items-corte/)
    assert.match(ui, /pathSubConFiltro\(`\/informes\/\$\{cid\}\/pdf\/corte-subcontratista/)
    assert.match(ui, /pathSubConFiltro\(`\/informes\/\$\{cid\}\/pdf\/memoria-corte-completo/)
    assert.match(ui, /pathSubConFiltro\(`\/informes\/\$\{cid\}\/excel\/corte-subcontratista/)
  })
})
