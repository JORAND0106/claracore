import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_UI_FS,
  esquemaIconBtnStyle,
  mapLegacyFontPxToCc,
} from './esquemaUiTypography.js'

describe('esquemaUiTypography', () => {
  it('roles apuntan a variables --cc-*', () => {
    assert.match(ESQUEMA_UI_FS.caption, /--cc-caption/)
    assert.match(ESQUEMA_UI_FS.body, /--cc-body/)
    assert.match(ESQUEMA_UI_FS.sm, /--cc-sm/)
  })

  it('iconBtn escala con --cc-body', () => {
    const s = esquemaIconBtnStyle({ primary: '#0f766e', border: '#ccc', text: '#111' }, false)
    assert.match(String(s.width), /--cc-body/)
    assert.match(String(s.height), /--cc-body/)
    assert.match(String(s.fontSize), /--cc-/)
  })

  it('mapLegacyFontPxToCc cubre micro→lg', () => {
    assert.equal(mapLegacyFontPxToCc(9), ESQUEMA_UI_FS.micro)
    assert.equal(mapLegacyFontPxToCc(12), ESQUEMA_UI_FS.caption)
    assert.equal(mapLegacyFontPxToCc(14), ESQUEMA_UI_FS.sm)
    assert.equal(mapLegacyFontPxToCc(16), ESQUEMA_UI_FS.body)
  })
})
