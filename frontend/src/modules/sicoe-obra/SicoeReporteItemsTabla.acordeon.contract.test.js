/**
 * Contrato: ítems del reporte usan acordeón (no ventana de tarjetas).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

describe('SicoeReporteItemsTabla · acordeón de registros', () => {
  it('expande registros en acordeón (FragmentReg) y conserva validación masiva', () => {
    const src = readFileSync(join(here, 'SicoeReporteItemsTabla.jsx'), 'utf8')
    assert.match(src, /function FragmentReg/)
    assert.match(src, /function FragmentItem/)
    assert.match(src, /mostrarMasiva/)
    assert.match(src, /puedeMasivaNivel/)
    assert.match(src, /onPedirComentarioMasivo/)
    assert.match(src, /onValidacionAprobar/)
    assert.doesNotMatch(src, /SicoeItemRegistrosVentana/)
    assert.doesNotMatch(src, /abrirVentanaItem/)
  })

  it('no quedan archivos de la ventana de tarjetas', () => {
    assert.equal(existsSync(join(here, 'SicoeItemRegistrosVentana.jsx')), false)
    assert.equal(existsSync(join(here, 'sicoeItemRegistrosVentanaHelpers.js')), false)
  })
})
