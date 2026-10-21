import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  almacenContraste,
  colorEstadoLinea,
  colorEstadoSolicitud,
  estiloAvisoAlmacen,
  tonoFilaSinInsumo,
} from './almacenContraste.js'

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

  it('el resaltado sin insumo es gris legible en oscuro y sigue gris en claro', () => {
    const darkUi = uiDe('dark')
    const lightUi = uiDe('light')
    const dark = tonoFilaSinInsumo(darkUi)
    const light = tonoFilaSinInsumo(lightUi)
    assert.equal(light.fondo, '#e7e5e4')
    assert.notEqual(dark.fondo, light.fondo)
    assert.ok(luminancia(dark.fondo) < 0.2)
    assert.ok(luminancia(light.fondo) > 0.7)
    const textoOscuro = '#E0F2FE'
    const textoClaro = '#0F2942'
    assert.ok(contraste(textoOscuro, dark.fondo) >= 7)
    assert.ok(contraste(textoClaro, light.fondo) >= 7)
    assert.ok(contraste(dark.badgeText, dark.badgeBg) >= 4.5)
    assert.ok(contraste(light.badgeText, light.badgeBg) >= 4.5)
    assert.ok(contraste(dark.vaciaText, dark.vaciaBg) >= 4.5)
    for (const estado of ['borrador', 'enviada', 'rechazada']) {
      const color = hexDe(colorEstadoSolicitud(estado, dark))
      assert.ok(contraste(color, dark.fondo) >= 4.5, `${estado} sobre sin insumo`)
      assert.ok(contraste(color, '#0F2038') >= 4.5, `${estado} sobre la grilla`)
    }
    assert.ok(contraste(dark.movimientoTotal, dark.fondo) >= 4.5)
    assert.ok(contraste(dark.movimientoParcial, dark.fondo) >= 4.5)
    assert.ok(contraste(dark.eliminar, dark.fondo) >= 4.5)
    assert.ok(contraste(dark.anular, dark.fondo) >= 4.5)
    assert.notEqual(dark.fondo, dark.seleccionadoFondo)
    assert.notEqual(dark.barra, dark.seleccionadoBorde)
    const linea = colorEstadoLinea('aprobado', almacenContraste(darkUi))
    assert.ok(contraste(linea, dark.fondo) >= 4.5)
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(panel, /tonoFilaSinInsumo/)
    assert.doesNotMatch(panel, /#e7e5e4|#d6d3d1|#57534e/)
  })
})

function luminancia(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const canales = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2]
}

function contraste(a, b) {
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function hexDe(color) {
  const m = String(color).match(/#([0-9a-fA-F]{6})/)
  return m ? `#${m[1]}` : color
}
