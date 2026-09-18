import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  LINE_STYLE_OPTIONS,
  normalizeLineStyle,
  lineDashForStyle,
  strokeStyledSegment,
  strokeStyledPolyline,
  LINE_STYLE_PUNTEADA,
  LINE_STYLE_DOBLE,
  LINE_STYLE_X,
} from './esquemaLineStyle.js'

describe('esquemaLineStyle', () => {
  it('expone 8 estilos', () => {
    assert.equal(LINE_STYLE_OPTIONS.length, 8)
    assert.equal(normalizeLineStyle(''), 'continua')
    assert.equal(normalizeLineStyle('punteada'), LINE_STYLE_PUNTEADA)
  })

  it('dash de punteada no vacío', () => {
    assert.ok(lineDashForStyle(LINE_STYLE_PUNTEADA, 3).length >= 2)
    assert.deepEqual(lineDashForStyle('continua', 3), [])
  })

  it('strokeStyled* no lanza con pts válidos', () => {
    const calls = []
    const ctx = {
      save() { calls.push('save') },
      restore() { calls.push('restore') },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() { calls.push('stroke') },
      setLineDash(d) { calls.push(['dash', d]) },
      lineCap: '',
      lineJoin: '',
      lineWidth: 1,
    }
    strokeStyledSegment(ctx, { x: 0, y: 0 }, { x: 40, y: 0 }, LINE_STYLE_PUNTEADA, 2)
    strokeStyledPolyline(ctx, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 10 }], LINE_STYLE_DOBLE, 3)
    strokeStyledPolyline(ctx, [{ x: 0, y: 0 }, { x: 50, y: 0 }], LINE_STYLE_X, 2)
    assert.ok(calls.includes('stroke') || calls.some((c) => c === 'stroke'))
  })
})
