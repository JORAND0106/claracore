import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  bitacoraCellNavProps,
  caretPermiteEdicionTextoBitacora,
} from './bitacoraExcelNav.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('bitacoraExcelNav', () => {
  it('bitacoraCellNavProps expone data-bitacora-row/col', () => {
    assert.deepEqual(bitacoraCellNavProps(2, 4), {
      'data-bitacora-row': 2,
      'data-bitacora-col': 4,
    })
  })

  it('caret en borde permite navegar; en medio edita', () => {
    const el = {
      value: 'hola',
      selectionStart: 0,
      selectionEnd: 0,
    }
    assert.equal(caretPermiteEdicionTextoBitacora(el, 'ArrowLeft'), false)
    assert.equal(caretPermiteEdicionTextoBitacora(el, 'ArrowRight'), true)
    el.selectionStart = 4
    el.selectionEnd = 4
    assert.equal(caretPermiteEdicionTextoBitacora(el, 'ArrowRight'), false)
    assert.equal(caretPermiteEdicionTextoBitacora(el, 'ArrowLeft'), true)
    el.selectionStart = 2
    el.selectionEnd = 2
    assert.equal(caretPermiteEdicionTextoBitacora(el, 'ArrowLeft'), true)
  })

  it('ActividadesEventoGrid y BitacoraEntradaEditor cablean navegación', () => {
    const act = readFileSync(join(here, 'ActividadesEventoGrid.jsx'), 'utf8')
    assert.match(act, /handleBitacoraExcelKeyNav/)
    assert.match(act, /cc-bitacora-excel-nav/)
    assert.match(act, /bitacoraCellNavProps/)

    const editor = readFileSync(join(here, 'BitacoraEntradaEditor.jsx'), 'utf8')
    assert.match(editor, /handleBitacoraExcelKeyNav/)
    assert.match(editor, /horasPrecargaDesdeHorario/)
    assert.match(editor, /emptyUso\(/)
  })
})
