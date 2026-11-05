/**
 * Contrato del posicionamiento anclado: flip arriba/abajo y maxHeight acotado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const hookSrc = readFileSync(join(here, 'useAnchoredDropdown.js'), 'utf8')
const listboxSrc = readFileSync(join(here, '../components/CcAnchoredListbox.jsx'), 'utf8')

describe('useAnchoredDropdown', () => {
  it('usa position fixed y elige arriba o abajo según espacio', () => {
    assert.match(hookSrc, /position:\s*'fixed'/)
    assert.match(hookSrc, /preferBelow/)
    assert.match(hookSrc, /spaceAbove/)
    assert.match(hookSrc, /spaceBelow/)
    assert.match(hookSrc, /visualViewport/)
    assert.match(hookSrc, /CC_ANCHORED_DROPDOWN_Z/)
    // Debe superar overlays de Plan/Export (z≈100070+)
    const m = /CC_ANCHORED_DROPDOWN_Z\s*=\s*(\d+)/.exec(hookSrc)
    assert.ok(m)
    assert.ok(Number(m[1]) > 100200)
  })

  it('recalcula en scroll (capture) y resize', () => {
    assert.match(hookSrc, /addEventListener\('scroll',\s*onScrollOrResize,\s*true\)/)
    assert.match(hookSrc, /addEventListener\('resize',\s*onScrollOrResize\)/)
  })
})

describe('CcAnchoredListbox', () => {
  it('porta el listado a document.body con overflow interno', () => {
    assert.match(listboxSrc, /createPortal/)
    assert.match(listboxSrc, /document\.body/)
    assert.match(listboxSrc, /overflowY:\s*'auto'/)
    assert.match(listboxSrc, /useAnchoredDropdown/)
    assert.match(listboxSrc, /theme\.bgCard|t\.bgCard|bgCard/)
  })
})
