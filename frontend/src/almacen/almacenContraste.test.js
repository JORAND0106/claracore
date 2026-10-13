import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { almacenContraste, estiloAvisoAlmacen } from './almacenContraste.js'

const dir = dirname(fileURLToPath(import.meta.url))

function uiDe(mode) {
  if (mode === 'dark') {
    return { card: { background: '#0F2038', border: '1px solid #1E3A5F' }, text: '#E0F2FE' }
  }
  if (mode === 'rest') {
    return { card: { background: '#F2EDE4', border: '1px solid #C9B8A4' }, text: '#2A2318' }
  }
  return { card: { background: '#FFFFFF', border: '1px solid #BAE6FD' }, text: '#0F2942' }
}

describe('contraste de popups de almacén', () => {
  it('cambia fondo y texto juntos en oscuro, claro y descanso', () => {
    const dark = almacenContraste(uiDe('dark'))
    const light = almacenContraste(uiDe('light'))
    const rest = almacenContraste(uiDe('rest'))
    assert.equal(dark.mode, 'dark')
    assert.equal(light.mode, 'light')
    assert.equal(rest.mode, 'rest')
    assert.notEqual(dark.panelBg, light.panelBg)
    assert.notEqual(rest.panelBg, light.panelBg)
    assert.match(dark.panelText, /E0F2FE/i)
    assert.match(rest.warnText, /6B4E16/i)
    const aviso = estiloAvisoAlmacen(dark, 'warn')
    assert.equal(aviso.background, dark.warnBg)
    assert.equal(aviso.color, dark.warnText)
    assert.match(aviso.border, /solid/)
  })

  it('los popups de solicitud y revisión ya no fijan blanco ni crema', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const revision = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    for (const src of [detalle, revision]) {
      assert.match(src, /almacenContraste\(ui\)/)
      assert.doesNotMatch(src, /#f8fafc|#fffbeb|#fef2f2|#eff6ff/)
    }
    const css = readFileSync(join(dir, '../index.css'), 'utf8')
    assert.match(css, /\.cc-almacen-rentabilidad-toggle[\s\S]*--cc-almacen-bg-card/)
  })
})
