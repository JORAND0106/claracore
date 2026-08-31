import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bitacoraSheetCssVars, bitacoraSheetStyles } from './bitacoraSheetStyles.js'

describe('bitacoraSheetStyles', () => {
  it('usa tipografía --cc-* (escala A A A)', () => {
    const ui = bitacoraSheetStyles({
      text: '#0F2942',
      bgCard: '#FFFFFF',
      primary: '#0077B6',
    })
    assert.equal(ui.th.fontSize, 'var(--cc-caption)')
    assert.equal(ui.td.fontSize, 'var(--cc-sm)')
    assert.equal(ui.cellInp.fontSize, 'var(--cc-sm)')
    assert.equal(ui.clipBtn.fontSize, 'var(--cc-sm)')
  })

  it('colores de encabezado siguen el primary del tema', () => {
    const dark = bitacoraSheetStyles({
      text: '#E0F2FE',
      textMuted: '#7FB3D3',
      bgCard: '#0F2038',
      primary: '#00B4C6',
      inputBg: '#0A1628',
    })
    assert.equal(dark.th.color, '#00B4C6')
    assert.equal(dark.td.color, '#E0F2FE')
    assert.equal(dark.border, '#7FB3D3')
    // Tint mezclado con fondo oscuro (no blanco puro)
    assert.match(dark.th.background, /^#[0-9a-fA-F]{6}$/)
    assert.notEqual(dark.th.background.toLowerCase(), '#d6eaf8')
  })

  it('css vars exponen tokens del tema para CSS compacto', () => {
    const vars = bitacoraSheetCssVars({
      text: '#0F2942',
      textMuted: '#4A7FA5',
      bgCard: '#FFFFFF',
      primary: '#0077B6',
      inputBg: '#F8FAFC',
      border: '#BAE6FD',
    })
    assert.equal(vars['--cc-primary'], '#0077B6')
    assert.equal(vars['--cc-bg-card'], '#FFFFFF')
    assert.equal(vars['--cc-input-bg'], '#F8FAFC')
    assert.ok(vars['--cc-sheet-grid-border'])
    assert.ok(vars['--cc-bitacora-header-bg'])
  })
})
