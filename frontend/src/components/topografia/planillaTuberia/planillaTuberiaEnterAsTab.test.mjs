/**
 * Enter→Tab en Planillas de Tubería (cabecera, cartera, cantidades, descuentos).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaEnterAsTab.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleEnterAsTab } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const utilsSrc = readFileSync(join(dir, 'planillaTuberiaUtils.js'), 'utf8')
const nivelacionSrc = readFileSync(
  join(dir, '../nivelacionUiShared.jsx'),
  'utf8',
)

describe('planilla tuberia Enter as Tab', () => {
  it('reutiliza la misma semántica que Circuito de Nivelación', () => {
    assert.match(utilsSrc, /export function handleEnterAsTab/)
    assert.match(utilsSrc, /ENTER_AS_TAB_SELECTOR/)
    assert.match(utilsSrc, /Shift\+Enter/)
    assert.match(nivelacionSrc, /export function handleEnterAsTab/)
  })

  it('el editor envuelve cabecera/cartera/cantidades/descuentos con handleEnterAsTab', () => {
    assert.match(formSrc, /const editorRef = useRef\(null\)/)
    assert.match(
      formSrc,
      /ref=\{editorRef\}[\s\S]*onKeyDown=\{\(e\) => handleEnterAsTab\(e, editorRef\.current\)\}/,
    )
    // Ya no se limita solo a la cartera
    assert.doesNotMatch(formSrc, /ref=\{tableRef\}/)
    assert.match(formSrc, /title="Cabecera \/ tramo"/)
    assert.match(formSrc, /Cartera de campo/)
    assert.match(formSrc, /Resumen de Cantidades/)
    assert.match(formSrc, /Descuentos Específicos/)
  })

  it('handleEnterAsTab avanza al siguiente input y respeta Shift', () => {
    const root = {
      contains(el) {
        return el && el._root === this
      },
      querySelectorAll() {
        return this._nodes
      },
      _nodes: [],
    }
    const makeInput = (id) => {
      const el = {
        id,
        tagName: 'INPUT',
        type: 'text',
        disabled: false,
        offsetParent: {},
        getClientRects: () => [{}],
        getAttribute: () => null,
        focus() { this.focused = true },
        select() { this.selected = true },
        _root: root,
      }
      return el
    }
    const a = makeInput('a')
    const b = makeInput('b')
    const c = makeInput('c')
    root._nodes = [a, b, c]

    const e = {
      key: 'Enter',
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      target: a,
      shiftKey: false,
    }
    handleEnterAsTab(e, root)
    assert.equal(e.defaultPrevented, true)
    assert.equal(b.focused, true)
    assert.equal(b.selected, true)

    const eBack = {
      key: 'Enter',
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      target: b,
      shiftKey: true,
    }
    handleEnterAsTab(eBack, root)
    assert.equal(a.focused, true)
  })

  it('no intercepta botones ni Enter con modificadores', () => {
    const root = {
      contains() { return true },
      querySelectorAll() { return [] },
    }
    const btnEvent = {
      key: 'Enter',
      target: { tagName: 'BUTTON', type: 'button' },
      preventDefault() { this.called = true },
    }
    handleEnterAsTab(btnEvent, root)
    assert.equal(btnEvent.called, undefined)

    const modEvent = {
      key: 'Enter',
      ctrlKey: true,
      target: { tagName: 'INPUT', type: 'text' },
      preventDefault() { this.called = true },
    }
    handleEnterAsTab(modEvent, root)
    assert.equal(modEvent.called, undefined)
  })
})
