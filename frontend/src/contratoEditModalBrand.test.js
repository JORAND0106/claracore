import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const src = readFileSync(new URL('./ContratoEditModal.jsx', import.meta.url), 'utf8')

describe('ContratoEditModal — tema del encabezado', () => {
  it('entrega tProp al encabezado de marca, no una variable t suelta', () => {
    const m = src.match(/<CcModalBrandHeader theme=\{(\w+)\} \/>/)
    assert.ok(m, 'CcModalBrandHeader debe recibir theme')
    assert.equal(m[1], 'tProp')
  })

  it('abrir el modal no lanza ReferenceError: t is not defined', () => {
    const m = src.match(/<CcModalBrandHeader theme=\{(\w+)\} \/>/)
    const ident = m[1]
    // Misma forma que el render: el modal cerrado sale antes; abierto evalúa el tema.
    const abrir = new Function(
      'tProp',
      'header',
      `if (!arguments[2]) return null;\nreturn header(${ident});`,
    )
    const theme = { text: '#0A4D68', border: '#BAE6FD' }
    let recibido = null
    const out = abrir(theme, (th) => { recibido = th; return 'ok' }, true)
    assert.equal(out, 'ok')
    assert.equal(recibido, theme)
  })
})
