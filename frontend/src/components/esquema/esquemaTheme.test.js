import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_THEME } from '../../theme/adminPanelTheme.js'
import { esquemaEntityInk, esquemaThemeMode, esquemaUiTheme } from './esquemaTheme.js'

describe('esquemaTheme', () => {
  it('maps Claro / Oscuro / Descansar to distinct canvas palettes', () => {
    const light = esquemaUiTheme(ADMIN_THEME.light)
    const dark = esquemaUiTheme(ADMIN_THEME.dark)
    const rest = esquemaUiTheme(ADMIN_THEME.rest)
    assert.equal(esquemaThemeMode(ADMIN_THEME.light).dark, false)
    assert.equal(esquemaThemeMode(ADMIN_THEME.dark).dark, true)
    assert.equal(esquemaThemeMode(ADMIN_THEME.rest).rest, true)
    assert.equal(light.canvas, ADMIN_THEME.light.bgCard)
    assert.equal(dark.canvas, ADMIN_THEME.dark.bgCard)
    assert.equal(rest.canvas, ADMIN_THEME.rest.bgCard)
    assert.notEqual(light.grid, dark.grid)
    assert.notEqual(light.snap.end, dark.snap.end)
    assert.equal(light.ink, ADMIN_THEME.light.text)
    assert.equal(dark.ink, ADMIN_THEME.dark.text)
  })

  it('Automático hereda la paleta del token activo (claro u oscuro)', () => {
    const day = esquemaUiTheme(ADMIN_THEME.light)
    const night = esquemaUiTheme(ADMIN_THEME.dark)
    assert.equal(day.dark, false)
    assert.equal(night.dark, true)
    assert.equal(day.wrap, ADMIN_THEME.light.bg)
    assert.equal(night.wrap, ADMIN_THEME.dark.bg)
  })

  it('remapea la tinta por defecto del tema y respeta un color personalizado', () => {
    const dark = esquemaUiTheme(ADMIN_THEME.dark)
    assert.equal(esquemaEntityInk('#1e293b', dark), dark.ink)
    assert.equal(esquemaEntityInk(ADMIN_THEME.light.text, dark), dark.ink)
    assert.equal(esquemaEntityInk('#dc2626', dark), '#dc2626')
  })
})
