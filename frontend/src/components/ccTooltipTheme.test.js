/**
 * Tests de tokens / variante / posicionamiento de tooltips institucionales.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CC_TOOLTIP_HELP_CHARS,
  ccTooltipPalette,
  placeTooltipRect,
  resolveTooltipThemeMode,
  resolveTooltipVariant,
} from './ccTooltipTheme.js'

describe('ccTooltipTheme', () => {
  it('paletas por tema tienen contraste institucional (no negro puro)', () => {
    for (const mode of ['light', 'dark', 'rest']) {
      const p = ccTooltipPalette(mode)
      assert.ok(p.bg && p.bg !== '#000' && p.bg !== '#000000')
      assert.ok(p.text && p.text !== '#fff' && p.text !== '#ffffff')
      assert.ok(p.border)
      assert.ok(p.accent)
    }
  })

  it('resolveTooltipThemeMode respeta light/dark/rest', () => {
    assert.equal(resolveTooltipThemeMode('light'), 'light')
    assert.equal(resolveTooltipThemeMode('dark'), 'dark')
    assert.equal(resolveTooltipThemeMode('rest'), 'rest')
  })

  it('variant short vs help por atributo y longitud', () => {
    const el = {
      getAttribute: (k) => (k === 'data-cc-tooltip-variant' ? 'help' : null),
      hasAttribute: () => false,
    }
    assert.equal(resolveTooltipVariant(el, 'x'), 'help')

    const elShort = {
      getAttribute: () => 'short',
      hasAttribute: () => false,
    }
    assert.equal(resolveTooltipVariant(elShort, 'a'.repeat(CC_TOOLTIP_HELP_CHARS + 5)), 'short')

    const elPlain = {
      getAttribute: () => null,
      hasAttribute: () => false,
    }
    assert.equal(resolveTooltipVariant(elPlain, 'Editar'), 'short')
    assert.equal(resolveTooltipVariant(elPlain, 'a'.repeat(CC_TOOLTIP_HELP_CHARS + 1)), 'help')
    assert.equal(resolveTooltipVariant(elPlain, 'Línea 1\nLínea 2'), 'help')
  })

  it('placeTooltipRect no se sale del viewport ni centra sobre el ancla', () => {
    const anchor = { left: 100, top: 200, width: 40, height: 30, right: 140, bottom: 230 }
    const tip = { width: 180, height: 48 }
    const vp = { width: 800, height: 600 }
    const pos = placeTooltipRect(anchor, tip, vp)
    assert.ok(pos.left >= 10)
    assert.ok(pos.top >= 10)
    assert.ok(pos.left + tip.width <= vp.width - 10)
    assert.ok(pos.top + tip.height <= vp.height - 10)
    // Preferido: arriba del ancla
    assert.ok(pos.top + tip.height <= anchor.top || pos.top >= anchor.bottom)
  })

  it('placeTooltipRect en borde inferior pasa a lateral o arriba', () => {
    const anchor = { left: 50, top: 560, width: 40, height: 30, right: 90, bottom: 590 }
    const tip = { width: 200, height: 80 }
    const vp = { width: 400, height: 600 }
    const pos = placeTooltipRect(anchor, tip, vp)
    assert.ok(pos.top + tip.height <= vp.height - 10)
    assert.ok(pos.left + tip.width <= vp.width - 10)
  })
})
