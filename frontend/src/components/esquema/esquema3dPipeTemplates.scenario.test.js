/**
 * C-3D-17 · cableado UI Tubería y accesorios (iPad/portátil; no celular).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('caso · tubería y accesorios plantillas', () => {
  it('modal: botón, biblioteca, popup Excel, auto-connect, no en celular', () => {
    const modal = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(modal, /esquema-3d-tuberia/)
    assert.match(modal, /EsquemaPipeLibraryPopup/)
    assert.match(modal, /EsquemaPipeParamsPopup/)
    assert.match(modal, /buildPipeTemplateSolid|confirmPipeTemplate/)
    assert.match(modal, /proposePipeAutoConnect/)
    assert.match(modal, /!isPhoneLayout && \(\s*<EsquemaPipeLibraryPopup/)
    assert.match(modal, /updatePipeTemplateSolid/)
  })

  it('UI biblioteca + campos por plantilla', () => {
    const ui = read('components/esquema/esquema3dPipeUi.jsx')
    assert.match(ui, /esquema-pipe-library/)
    assert.match(ui, /esquema-pipe-params/)
    assert.match(ui, /PIPE_TEMPLATE_CATALOG/)
    assert.match(ui, /placeholder/)
    const tpl = read('components/esquema/esquema3dPipeTemplates.js')
    assert.match(tpl, /pipeOuterDiameterM/)
    assert.match(tpl, /pipeExteriorVolumeElbowM3/)
    assert.match(tpl, /PIPE_TEMPLATE_FAMILY/)
  })

  it('contrato C-3D-17 + test:esquema', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-3D-17/)
    assert.match(md, /Tubería y accesorios/)
    assert.match(md, /cota lomo/i)
    assert.match(md, /caso 54|54\./)
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquema3dPipeTemplates\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /esquema3dPipeTemplates\.scenario\.test\.js/)
  })
})
