import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pptoSheetStyles, pptoSheetCssVars } from './pptoSheetStyles.js'

const light = {
  bg: '#F0F9FF', bgCard: '#FFFFFF', border: '#BAE6FD', text: '#0F2942',
  textMuted: '#4A7FA5', primary: '#0077B6', inputBg: '#F8FAFC',
}
const dark = {
  bg: '#0A1628', bgCard: '#0F2038', border: '#1E3A5F', text: '#E0F2FE',
  textMuted: '#7FB3D3', primary: '#00B4C6', inputBg: '#0A1628',
}
const rest = {
  bg: '#E8E0D5', bgCard: '#F2EDE4', border: '#C9B8A4', text: '#2A2318',
  textMuted: '#5C5346', primary: '#0E7490', inputBg: '#FAF6EF',
}

describe('pptoSheetStyles', () => {
  it('usa tipografía --cc-* (no px fijos) en th/td', () => {
    const s = pptoSheetStyles(light)
    assert.equal(s.th.fontSize, 'var(--cc-caption)')
    assert.equal(s.td.fontSize, 'var(--cc-sm)')
    assert.equal(s.cellInp.fontSize, 'var(--cc-input)')
  })

  it('dibuja bordes de celda en th y td', () => {
    const s = pptoSheetStyles(light)
    assert.match(String(s.th.border), /1px solid/)
    assert.match(String(s.td.border), /1px solid/)
    assert.equal(s.th.border, s.td.border)
  })

  it('adapta encabezado y contraste a Claro, Oscuro y Descansar', () => {
    for (const theme of [light, dark, rest]) {
      const s = pptoSheetStyles(theme)
      assert.ok(s.headerBg)
      assert.ok(s.headerColor)
      assert.equal(s.th.background, s.headerBg)
      assert.equal(s.th.color, s.headerColor)
      assert.equal(s.text, theme.text)
      assert.equal(s.bgCard, theme.bgCard)
    }
  })

  it('en oscuro usa borde de grilla más claro que el default slate', () => {
    const s = pptoSheetStyles(dark)
    assert.equal(s.border, dark.textMuted)
  })

  it('respeta override sheetGridBorder / sheetHeaderBg del tema', () => {
    const s = pptoSheetStyles({
      ...light,
      sheetGridBorder: '#64748b',
      sheetHeaderBg: '#abcdef',
      sheetHeaderColor: '#112233',
    })
    assert.equal(s.border, '#64748b')
    assert.equal(s.headerBg, '#abcdef')
    assert.equal(s.headerColor, '#112233')
  })

  it('exporta CSS vars para sincronizar tema en media queries', () => {
    const vars = pptoSheetCssVars(light)
    assert.equal(vars['--cc-primary'], light.primary)
    assert.equal(vars['--cc-bg-card'], light.bgCard)
    assert.ok(vars['--cc-sheet-grid-border'])
    assert.ok(vars['--cc-ppto-sheet-header-bg'])
  })
})
