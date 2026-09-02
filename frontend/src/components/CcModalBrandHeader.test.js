/**
 * @fileoverview Tests — cinta de marca ClaraCore en popups.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CC_MODAL_FAVICON_SRC,
  CC_MODAL_BRAND_NAME,
  claraCoreBrandTextColor,
  resolveModalThemeIsDark,
  ccModalBrandHeaderStyle,
} from './ccModalBrandTheme.js'

describe('CcModalBrandHeader theme', () => {
  it('usa el favicon público (ícono sin texto)', () => {
    assert.match(CC_MODAL_FAVICON_SRC, /\/favicon\.png/)
    assert.equal(CC_MODAL_BRAND_NAME, 'ClaraCore')
  })

  it('texto azulado oscuro en tema claro', () => {
    const c = claraCoreBrandTextColor({ text: '#0F2942', bgCard: '#FFFFFF', mode: 'light' })
    assert.equal(c, '#0F2942')
    assert.equal(resolveModalThemeIsDark({ mode: 'light' }), false)
  })

  it('texto claro en tema oscuro', () => {
    const c = claraCoreBrandTextColor({ text: '#E0F2FE', bgCard: '#0F2038', mode: 'dark' })
    assert.equal(c, '#E0F2FE')
    assert.equal(resolveModalThemeIsDark({ mode: 'dark' }), true)
  })

  it('cinta tiene altura mínima para el ícono', () => {
    const s = ccModalBrandHeaderStyle({ mode: 'light', border: '#BAE6FD', bgCard: '#fff' })
    assert.ok(s.minHeight >= 26)
    assert.equal(s.display, 'flex')
    assert.equal(s.alignItems, 'center')
  })
})
