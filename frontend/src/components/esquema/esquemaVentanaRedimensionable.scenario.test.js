/**
 * C-TX-12 / C-2D-08 · ventana del esquema redimensionable (iPad/portátil).
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

describe('caso · ventana de esquema redimensionable', () => {
  it('modal cablea bordes/esquina, persistencia y no en celular', () => {
    const modal = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(modal, /data-modal-resizable/)
    assert.match(modal, /esquema-modal-resize-\$\{edge\}/)
    assert.match(modal, /beginModalResize/)
    assert.match(modal, /ESQUEMA_MODAL_RESIZE_EDGES/)
    assert.match(modal, /writeEsquemaModalSizePref/)
    assert.match(modal, /resolveEsquemaModalLayout/)
    assert.match(modal, /orientationchange/)
    // Celular no usa handles de resize (isPhoneLayout).
    assert.match(modal, /!isPhoneLayout && ESQUEMA_MODAL_RESIZE_EDGES/)
    // No forzar squareModalOuterSize en cada resize de pantalla.
    assert.doesNotMatch(
      modal,
      /setModalLayout\(squareModalOuterSize\(/,
    )
  })

  it('módulo de resize exporta clamp / delta / pref', () => {
    const src = read('components/esquema/esquemaModalResize.js')
    assert.match(src, /clampEsquemaModalOuterSize/)
    assert.match(src, /applyEsquemaModalResizeDelta/)
    assert.match(src, /ESQUEMA_MODAL_SIZE_KEY/)
    assert.match(src, /cc_esquema_modal_outer_size_v1/)
  })

  it('contrato C-TX-12 + C-2D-08 actualizado + test:esquema', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-TX-12/)
    assert.match(md, /redimension|tamaño ajustable|arrastrando/i)
    assert.match(md, /C-2D-08/)
    assert.match(md, /caso 54|54\./)
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaModalResize\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /esquemaVentanaRedimensionable\.scenario\.test\.js/)
  })
})
