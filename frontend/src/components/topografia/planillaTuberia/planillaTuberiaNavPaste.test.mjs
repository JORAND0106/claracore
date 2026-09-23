/**
 * Flechas + Enter→Tab y pegado Abscisa (type=text).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaNavPaste.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  caretPermiteEdicionTexto,
  filtrarLinksSicoeVigentes,
  handleEnterAsTab,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const utilsSrc = readFileSync(join(dir, 'planillaTuberiaUtils.js'), 'utf8')
const calcSrc = readFileSync(join(dir, 'planillaTuberiaCalc.js'), 'utf8')
const excelSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_excel.py'),
  'utf8',
)
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('Navegación flechas + pegado Abscisa + reportes vigentes', () => {
  it('cartera usa type=text con data-cartera-row/col (pega Abscisa + flechas)', () => {
    assert.match(formSrc, /data-cartera-row=\{idx\}/)
    assert.match(formSrc, /data-cartera-col=\{colIdx\}/)
    assert.match(formSrc, /type="text"/)
    assert.match(formSrc, /onPaste=\{\(e\) => onPasteCartera\(idx, k, e\)\}/)
    assert.match(formSrc, /\['abscisa', 'terreno_natural'/)
  })

  it('handleEnterAsTab intercepta flechas', () => {
    assert.match(utilsSrc, /ArrowUp/)
    assert.match(utilsSrc, /data-cartera-row/)
  })

  it('flecha abajo mueve a la celda inferior de la cartera', () => {
    const root = {
      contains(el) { return el && el._root === this },
      querySelectorAll() { return this._nodes },
      _nodes: [],
    }
    const make = (row, col, value = '') => ({
      tagName: 'INPUT',
      type: 'text',
      value,
      selectionStart: 0,
      selectionEnd: String(value).length,
      disabled: false,
      offsetParent: {},
      getClientRects: () => [{}],
      getAttribute(name) {
        if (name === 'data-cartera-row') return String(row)
        if (name === 'data-cartera-col') return String(col)
        return null
      },
      hasAttribute(name) {
        return name === 'data-cartera-row' || name === 'data-cartera-col'
      },
      focus() { this.focused = true },
      select() { this.selected = true },
      _root: root,
      row,
      col,
    })
    const a00 = make(0, 0, '10.5')
    const a01 = make(0, 1)
    const a10 = make(1, 0)
    root._nodes = [a00, a01, a10]
    const e = {
      key: 'ArrowDown',
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      target: a00,
    }
    handleEnterAsTab(e, root)
    assert.equal(e.defaultPrevented, true)
    assert.equal(a10.focused, true)
  })

  it('←/→ no saltan de celda si el caret está editando texto', () => {
    assert.equal(
      caretPermiteEdicionTexto({ value: 'abc', selectionStart: 1, selectionEnd: 1 }, 'ArrowLeft'),
      true,
    )
    assert.equal(
      caretPermiteEdicionTexto({ value: 'abc', selectionStart: 0, selectionEnd: 0 }, 'ArrowLeft'),
      false,
    )
    assert.equal(
      caretPermiteEdicionTexto({ value: 'abc', selectionStart: 0, selectionEnd: 3 }, 'ArrowRight'),
      false,
    )
    assert.equal(
      caretPermiteEdicionTexto({ value: 'abc', selectionStart: 1, selectionEnd: 2 }, 'ArrowRight'),
      true,
    )

    const root = {
      contains(el) { return el && el._root === this },
      querySelectorAll() { return this._nodes },
      _nodes: [],
    }
    const editing = {
      tagName: 'INPUT',
      type: 'text',
      value: '12.50',
      selectionStart: 2,
      selectionEnd: 2,
      disabled: false,
      offsetParent: {},
      getClientRects: () => [{}],
      getAttribute() { return null },
      hasAttribute() { return false },
      focus() { this.focused = true },
      select() { this.selected = true },
      _root: root,
    }
    const other = {
      tagName: 'INPUT',
      type: 'text',
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      disabled: false,
      offsetParent: {},
      getClientRects: () => [{}],
      getAttribute() { return null },
      hasAttribute() { return false },
      focus() { this.focused = true },
      select() { this.selected = true },
      _root: root,
    }
    root._nodes = [editing, other]
    const e = {
      key: 'ArrowLeft',
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      target: editing,
    }
    handleEnterAsTab(e, root)
    assert.equal(e.defaultPrevented, false)
    assert.equal(other.focused, undefined)
  })

  it('filtra links SICOE eliminados', () => {
    const links = [
      { reporte_id: 10, numero_reporte: 62 },
      { reporte_id: 11, numero_reporte: 63 },
      { reporte_id: 12, numero_reporte: 64 },
    ]
    const kept = filtrarLinksSicoeVigentes(links, [10])
    assert.equal(kept.length, 1)
    assert.equal(kept[0].numero_reporte, 62)
  })

  it('backend poda sicoe_reportes al abrir detalle', () => {
    assert.match(routesSrc, /_filtrar_sicoe_reportes_vigentes/)
    assert.match(routesSrc, /planilla = _filtrar_sicoe_reportes_vigentes/)
  })

  it('Excel reserva bloque Notas y calc genera notas_descuento_altura', () => {
    assert.match(excelSrc, /_write_bloque_notas/)
    assert.match(excelSrc, /Notas/)
    assert.match(calcSrc, /notas_descuento_altura/)
    assert.match(formSrc, /Notas de descuento de altura/)
  })
})
